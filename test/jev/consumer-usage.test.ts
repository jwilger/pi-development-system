import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { Usage } from "@earendil-works/pi-ai";
import type { Exec } from "../../src/core/exec.ts";
import { parseReviewPacket } from "../../src/core/review-packet.ts";
import { isParseError, type SliceRef } from "../../src/core/types.ts";
import { createJevHolder } from "../../src/jev/holder.ts";
import { createIntakeTool } from "../../src/planning/intake-tool.ts";
import { createTaskCheckTool } from "../../src/planning/task-check-tool.ts";
import { snapshotDiff } from "../../src/review/digest.ts";
import { createLensReviewTool } from "../../src/review/lens-review-tool.ts";
import { createReviewRecordTool, createReviewStartTool } from "../../src/review/review-tools.ts";
import { createSubmissionStore } from "../../src/review/submissions.ts";
import { createRouteTaskTool } from "../../src/state/route-task-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { deferred } from "../harness/deferred.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const usage: Usage = {
  input: 5,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 6,
  cost: { input: 0.05, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.06 },
};
const names = [
  "devsys_intake",
  "devsys_review_start",
  "devsys_review_record",
  "devsys_lens_review",
  "devsys_route_task",
  "devsys_task_check",
] as const;

const record = `## T1 — Trim whitespace
**Goal:** A trailing space on an email is ignored.
**Files:** src/login.ts, test/login.test.ts
**Interfaces:** \`normalizeEmail(raw: string): string\`
**First failing test:** test/login.test.ts asserts the trimmed email logs in.
**Steps:**
1. Add the failing test.
2. Add an email normalizer.
3. Normalize the email before login.
**Run:** \`npm test\`
**Expected:** 1 test passes, 0 fail.
**Out of scope:** Password handling.
`;
const packet = `## Review — fixture — round 1 — lenses: types
### Sources inspected
- x.ts:1
### Findings
- [should-fix] types \`x.ts:1\` — handle empty input — otherwise crashes
### Verdict
blocking
`;

async function fixture(t: TestContext, name: (typeof names)[number]) {
  const root = mkdtempSync(join(tmpdir(), "devsys-consumers-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs/product"), { recursive: true });
  writeFileSync(join(root, "docs/product/brief.md"), "# Brief\n\nBuild a calculator.\n");
  writeFileSync(join(root, "task.md"), record);
  const fake = createFakePi({
    cwd: root,
    hasUI: false,
    classifiers: ["typesafe/jev-latest"],
    // A billed provider response without usable answers must retain its usage on fallback.
    classifyAnswers: {},
    classifyUsage: usage,
  });
  const holder = createJevHolder();
  const state = createSessionState(fake.api);
  if (name !== "devsys_intake") {
    state.update((s) => ({ ...s, activeSlice: "fixture" as SliceRef, sizing: "capability" }));
  }
  const exec: Exec = async (_command, args) => ({
    code: 0,
    stdout: args.includes("ls-files") ? "" : "diff --git a/x.ts b/x.ts\n+1\n",
    stderr: "",
  });
  const deps = {
    pi: fake.api,
    state,
    submissions: createSubmissionStore(),
    jev: holder.forContext,
    exec,
    now: () => new Date("2026-10-06T10:00:00Z"),
  };
  const tools = {
    devsys_intake: createIntakeTool(deps),
    devsys_review_start: createReviewStartTool(deps),
    devsys_review_record: createReviewRecordTool(deps),
    devsys_lens_review: createLensReviewTool(deps),
    devsys_route_task: createRouteTaskTool(deps),
    devsys_task_check: createTaskCheckTool(deps),
  };
  const snap = await snapshotDiff(exec, root, "HEAD");
  if (!snap.ok) throw new Error("Invalid diff fixture");
  const params = {
    devsys_intake: { request: "Trim email whitespace" },
    devsys_review_start: {},
    devsys_review_record: { diffDigest: snap.value.digest, packets: [packet] },
    devsys_lens_review: {},
    devsys_route_task: { task: "Trim email whitespace" },
    devsys_task_check: { path: "task.md" },
  };
  return {
    fake,
    state,
    submissions: deps.submissions,
    run: (signal?: AbortSignal) =>
      tools[name].execute("consumer", params[name] as never, signal, undefined, fake.ctx as never),
  };
}

for (const cancelBeforeStart of [true, false]) {
  test(`cancelling intake ${cancelBeforeStart ? "before" : "during"} sizing opens no dialog and preserves workflow`, async (t) => {
    const { fake, state, run } = await fixture(t, "devsys_intake");
    fake.ui.hasUI = true;
    fake.ui.selectResponses.push("change");
    const before = state.get();
    const caller = new AbortController();
    if (cancelBeforeStart) caller.abort();
    const pending = run(caller.signal);
    caller.abort();
    await pending;
    assert.equal(fake.ui.calls.length, 0);
    assert.equal(state.get(), before);
  });
}

for (const name of ["devsys_review_start", "devsys_review_record"] as const) {
  for (const cancelBeforeStart of [true, false]) {
    test(`${name} cancelled ${cancelBeforeStart ? "before" : "during"} classification preserves workflow and submissions`, async (t) => {
      const { fake, state, submissions, run } = await fixture(t, name);
      const parsed = parseReviewPacket(packet);
      if (isParseError(parsed)) throw new Error("Invalid review fixture");
      submissions.put(parsed);
      const before = state.get();
      const entered = deferred();
      const release = deferred();
      t.after(() => release.resolve());
      const classify = fake.ctx.modelRegistry.classify.bind(fake.ctx.modelRegistry);
      Object.assign(fake.ctx.modelRegistry, {
        classify: async (...args: Parameters<typeof classify>) => {
          entered.resolve();
          await release.promise;
          return classify(...args);
        },
      });
      const caller = new AbortController();
      if (cancelBeforeStart) caller.abort();
      const pending = run(caller.signal);
      if (!cancelBeforeStart) await entered.promise;
      caller.abort();
      const result = await pending;
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /cancelled/);
      assert.equal(state.get(), before);
      assert.deepEqual(submissions.forRound("fixture", 1), [parsed]);
    });
  }
}

for (const name of names) {
  test(`${name} preserves billed classifier usage on its conservative fallback`, async (t) => {
    const { fake, run } = await fixture(t, name);
    const result = await run();
    const calls = fake.classifyCalls.count;
    assert.ok(calls > 0, "the fixture must reach the classifier");
    assert.equal(result.usage?.totalTokens, calls * usage.totalTokens);
    assert.equal(result.usage?.cost.total, calls * usage.cost.total);
  });

  test(`${name} forwards cancellation without starting a classifier request`, async (t) => {
    const { fake, run } = await fixture(t, name);
    const caller = new AbortController();
    caller.abort();
    const result = await run(caller.signal);
    assert.equal(fake.classifyCalls.count, 0);
    assert.equal(result.usage, undefined);
  });
}
