import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { err } from "../../src/core/result.ts";
import type { SliceRef } from "../../src/core/types.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { registerCommitGuard } from "../../src/gates/commit-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { snapshotDiff } from "../../src/review/digest.ts";
import { createReviewRecordTool, createReviewStartTool } from "../../src/review/review-tools.ts";
import { createSubmissionStore } from "../../src/review/submissions.ts";
import { createSubmitReviewTool } from "../../src/review/submit-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const clean =
  "## Review — s1 — round 1 — lenses: types\n### Sources inspected\n- a.ts:1\n### Findings\n- none\n### Verdict\nno-blocking\n";
const text = (r: { content: readonly { type: string }[] }): string =>
  r.content.map((c) => ("text" in c ? String(c.text) : "")).join("\n");
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};
function setup(t: TestContext, jev = offline) {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-local-review-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", cwd]);
  writeFileSync(join(cwd, ".development-system.toml"), '[review]\nguidance=["concern.md"]\n');
  writeFileSync(join(cwd, "concern.md"), "Tenant counts exclude archived records.\n");
  execFileSync("git", ["-C", cwd, "add", ".development-system.toml", "concern.md"]);
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  state.update((s) => ({ ...s, activeSlice: "s1" as SliceRef, phase: "implementing" }));
  const submissions = createSubmissionStore();
  const exec: Exec = async (_cmd, args) => ({
    code: 0,
    stderr: "",
    stdout:
      args.includes("ls-files") || args.includes("--name-only")
        ? ""
        : "diff --git a/a.ts b/a.ts\n+1\n",
  });
  const deps = { state, submissions, exec, jev: () => jev };
  const start = () =>
    createReviewStartTool(deps).execute("s", {}, undefined, undefined, fake.ctx as never);
  const identity = () => state.get().reviews?.[0]?.pending?.input.identity;
  const record = async (params: Record<string, unknown> = {}) => {
    const snap = await snapshotDiff(exec, cwd, "HEAD");
    if (!snap.ok) throw new Error(`Test fixture snapshot failed: ${snap.error}`);
    return createReviewRecordTool(deps).execute(
      "r",
      {
        diffDigest: snap.ok ? snap.value.digest : "",
        reviewInputIdentity: identity(),
        packets: [clean],
        ...params,
      } as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
  };
  const submit = (params: Record<string, unknown> = {}) =>
    createSubmitReviewTool({ state, submissions }).execute(
      "u",
      {
        slice: "s1",
        round: 1,
        lenses: ["types"],
        sources: ["a.ts:1"],
        findings: [],
        verdict: "no-blocking",
        reviewInputIdentity: identity(),
        ...params,
      } as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
  registerCommitGuard({ ...deps, pi: fake.api, approvals: createApprovalStore(fake.api) });
  const commit = () =>
    fake.emit({
      type: "tool_call",
      toolName: "bash",
      toolCallId: "c",
      input: {
        command:
          "git commit -m 'fix(example): respect local counts' -m 'Archive exclusions keep tenant counts accurate for repository callers.'",
      },
    } as never) as Promise<{ block: boolean; reason: string } | undefined>;
  return { cwd, state, submissions, start, record, submit, identity, commit };
}

test("superseded identity cannot submit through the typed public tool", async (t) => {
  const host = setup(t);
  await host.start();
  const result = await host.submit({ reviewInputIdentity: "superseded" });
  assert.equal(result.isError, true, text(result));
  assert.match(text(result), /stale-review-input/);
  assert.deepEqual(host.submissions.forRound("s1", 1), []);
});

test("snapshot-bearing handoff and typed result preserve the exact configured input", async (t) => {
  const host = setup(t);
  const started = await host.start();
  assert.notEqual(started.isError, true, text(started));
  const identity = host.identity();
  assert.ok(identity);
  const spawn = JSON.parse(text(started).split("\n").at(-1) ?? "{}");
  assert.match(spawn.task, /Tenant counts exclude archived records/);
  assert.match(spawn.task, /concern\.md/);
  assert.ok(spawn.task.includes(identity));
  assert.notEqual((await host.submit()).isError, true);
  const repeated = await host.start();
  assert.equal(repeated.isError, true);
  assert.match(text(repeated), /Next: devsys_review_record/);
  assert.ok(text(repeated).includes(identity));
  const recorded = await host.record({ packets: [] });
  assert.notEqual(recorded.isError, true, text(recorded));
  assert.equal(host.state.get().reviews?.[0]?.rounds[0]?.input?.identity, identity);
  assert.equal(host.state.get().reviews?.[0]?.pending, undefined);
});

test("configured fallback requires the original identity and range", async (t) => {
  const host = setup(t);
  await host.start();
  const before = host.state.get();
  for (const params of [
    { reviewInputIdentity: undefined },
    { reviewInputIdentity: "other" },
    { diffRange: "main..HEAD" },
  ]) {
    const result = await host.record(params);
    assert.equal(result.isError, true);
    assert.match(text(result), /stale-review-input/);
    assert.equal(host.state.get(), before);
  }
  const accepted = await host.record();
  assert.notEqual(accepted.isError, true, text(accepted));
});

test("missing configured sources refuse preparation without state changes", async (t) => {
  const host = setup(t);
  const before = host.state.get();
  rmSync(join(host.cwd, "concern.md"));
  const result = await host.start();
  assert.equal(result.isError, true);
  assert.match(text(result), /guidance-error/);
  assert.equal(host.state.get(), before);
  assert.doesNotMatch(text(result), /agent_spawn/);
});

test("removing the final configured source cannot record its old input", async (t) => {
  const host = setup(t);
  await host.start();
  const old = host.identity();
  writeFileSync(join(host.cwd, ".development-system.toml"), "[review]\n");
  const result = await host.record({ reviewInputIdentity: old });
  assert.equal(result.isError, true);
  assert.match(text(result), /stale-review-input/);
  assert.equal(host.state.get().reviews?.[0]?.rounds.length, 0);
  assert.notEqual((await host.start()).isError, true);
  assert.equal(host.identity(), undefined);
  assert.notEqual((await host.record()).isError, true);
});

test("guidance changes during lens classification cannot dispatch a stale handoff", async (t) => {
  const jev: Jev = {
    ...offline,
    ask: async () => {
      writeFileSync(join(host.cwd, "concern.md"), "Changed during classification.\n");
      return err({ kind: "no-model" });
    },
  };
  const host = setup(t, jev);
  const before = host.state.get();
  const result = await host.start();
  assert.equal(result.isError, true);
  assert.match(text(result), /stale-review-input/);
  assert.equal(host.state.get(), before);
});

test("guidance changes during severity adjustment preserve the unrecorded submission", async (t) => {
  const jev: Jev = {
    ...offline,
    ask: async (_state, questions) => {
      if ("severity" in questions)
        writeFileSync(join(host.cwd, "concern.md"), "Changed during severity adjustment.\n");
      return err({ kind: "no-model" });
    },
  };
  const host = setup(t, jev);
  await host.start();
  const identity = host.identity();
  assert.notEqual(
    (
      await host.submit({
        findings: [
          { lens: "types", severity: "blocking", summary: "A concrete synthetic defect." },
        ],
        verdict: "blocking",
      })
    ).isError,
    true,
  );
  const result = await host.record({ packets: [] });
  assert.equal(result.isError, true, text(result));
  assert.match(text(result), /stale-review-input/);
  assert.equal(host.state.get().reviews?.[0]?.rounds.length, 0);
  assert.equal(host.submissions.forRound("s1", 1, identity).length, 1);
});

test("changed guidance cannot commit using a previously clean unchanged diff", async (t) => {
  const host = setup(t);
  await host.start();
  assert.notEqual((await host.record()).isError, true);
  assert.equal(await host.commit(), undefined);
  writeFileSync(join(host.cwd, "concern.md"), "Tenant counts include archived records.\n");
  const blocked = await host.commit();
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /review\.unsatisfied/);
  assert.match(blocked?.reason ?? "", /guidance|input/);
});

test("removing the final source or losing it cannot bypass the commit input check", async (t) => {
  for (const kind of ["unconfigured", "missing"] as const) {
    const host = setup(t);
    await host.start();
    assert.notEqual((await host.record()).isError, true);
    assert.equal(await host.commit(), undefined);
    if (kind === "unconfigured")
      writeFileSync(join(host.cwd, ".development-system.toml"), "version=1\n");
    else rmSync(join(host.cwd, "concern.md"));
    const blocked = await host.commit();
    assert.equal(blocked?.block, true, kind);
    assert.match(blocked?.reason ?? "", /review\.unsatisfied/);
    assert.match(blocked?.reason ?? "", /guidance|input/);
  }
});

test("changed concerns cannot earn a clean round", async (t) => {
  const host = setup(t);
  await host.start();
  const identity = host.identity();
  writeFileSync(join(host.cwd, "concern.md"), "Tenant counts include archived records.\n");
  const result = await host.record({ reviewInputIdentity: identity });
  assert.equal(result.isError, true, text(result));
  assert.match(text(result), /stale-review-input/);
  assert.equal(host.state.get().reviews?.[0]?.rounds.length, 0);
});
