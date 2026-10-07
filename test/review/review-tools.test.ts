import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import type { Exec } from "../../src/core/exec.ts";
import { err, ok } from "../../src/core/result.ts";
import type { SliceRef } from "../../src/core/types.ts";
import type { Jev } from "../../src/jev/client.ts";
import { snapshotDiff } from "../../src/review/digest.ts";
import { createReviewRecordTool, createReviewStartTool } from "../../src/review/review-tools.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const bool = (probability: number): ClassifierAnswer => ({ type: "bool", probability });
const jevWith = (lens: Partial<Record<string, number>>, severity?: string): Jev => ({
  ask: async (_state, questions) => {
    const out: Record<string, ClassifierAnswer> = {};
    for (const key of Object.keys(questions)) {
      if (key === "severity") {
        out[key] = {
          type: "choice",
          choice: severity ?? "nit",
          probabilities: { [severity ?? "nit"]: 1 },
          confidence: 0.95,
        };
      } else out[key] = bool(lens[key] ?? 0);
    }
    return ok(out);
  },
  availability: () => "online",
  model: () => "fake/jev",
});
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};

const exec =
  (diff: string, untracked = ""): Exec =>
  async (_command, args) => ({
    code: 0,
    stdout: args.includes("ls-files")
      ? untracked
      : args.includes("hash-object")
        ? "abc123\n"
        : diff,
    stderr: "",
  });

const DIFF = "diff --git a/x b/x\n+1\n";
const setup = (jev: Jev, diff = DIFF, withSlice = true, untracked = "") => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-review-"));
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  if (withSlice) state.update((s) => ({ ...s, activeSlice: "s1" as SliceRef }));
  const deps = {
    state,
    jev: () => jev,
    exec: exec(diff, untracked),
    now: () => new Date("2026-10-06T10:00:00Z"),
  };
  return {
    cwd,
    state,
    start: (p: Record<string, unknown> = {}) =>
      createReviewStartTool(deps).execute("c", p as never, undefined, undefined, fake.ctx as never),
    // Fills diffDigest the way the coordinator copies it from devsys_review_start's reply.
    record: async (p: Record<string, unknown>) => {
      const snap = await snapshotDiff(deps.exec, cwd, "HEAD");
      const digest = snap.ok ? snap.value.digest : "";
      return createReviewRecordTool(deps).execute(
        "c",
        { diffDigest: digest, ...p } as never,
        undefined,
        undefined,
        fake.ctx as never,
      );
    },
    snapshot: () => snapshotDiff(deps.exec, cwd, "HEAD"),
  };
};
const text = (r: { content: readonly { type: string }[] }): string =>
  r.content.map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("\n");

const packet = (findings: string, verdict: string, round = 1, lenses = "types, tests") =>
  `## Review — s1 — round ${round} — lenses: ${lenses}\n### Sources inspected\n- a.ts:1-5\n### Findings\n${findings}\n### Verdict\n${verdict}\n`;

test("start picks Jev lenses, returns an agent_spawn payload and shows 0/3 clean", async () => {
  const t = setup(jevWith({ security: 0.9, types: 0.7 }));
  const r = await t.start();
  assert.notEqual(r.isError, true);
  const out = text(r);
  assert.match(out, /lenses: security, types/);
  assert.match(out, /"type":"reviewer"/);
  assert.match(out, /"path":"\/review-s1-r1-[a-z0-9]+"/);
  assert.match(out, /git diff HEAD/);
  const review = t.state.get().reviews?.[0];
  assert.equal(review?.required, 3);
  assert.equal(review?.rounds.length, 0);
});

test("with Jev offline start falls back to the default lenses and says so", async () => {
  const t = setup(offline);
  const out = text(await t.start({ diffRange: "main..HEAD" }));
  assert.match(out, /Jev unavailable/i);
  assert.match(out, /lenses: types, tests/);
  assert.match(out, /git diff main\.\.HEAD/);
});

test("start without a slice or active slice is an error; so is an empty diff", async () => {
  const t = setup(offline, "");
  assert.equal((await t.start()).isError, true);
  const bare = setup(offline, undefined, false);
  const r = await bare.start();
  assert.equal(r.isError, true);
  assert.match(text(r), /slice/);
});

test("record counts clean rounds, writes nits to followups and reports the next action", async () => {
  const t = setup(offline);
  await t.start();
  const r = await t.record({
    packets: [packet("- [nit] types `a.ts:2` — rename — clearer", "no-blocking")],
  });
  assert.notEqual(r.isError, true);
  assert.match(text(r), /review: 1\/3 clean/);
  assert.match(text(r), /next: review/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 1);
  const followups = readFileSync(join(t.cwd, "docs/decisions/followups.md"), "utf8");
  assert.match(followups, /From s1 review round 1/);
  assert.match(followups, /rename/);
});

test("a should-fix finding resets the streak and asks for fixes", async () => {
  const t = setup(offline);
  await t.start();
  await t.record({ packets: [packet("none", "no-blocking")] });
  const r = await t.record({
    packets: [packet("- [should-fix] tests `a.ts:2` — no test — real defect", "blocking", 2)],
  });
  assert.match(text(r), /review: 0\/3 clean/);
  assert.match(text(r), /next: fix-findings/);
  // Re-running the review on unchanged code is refused: it would let a finding be rolled away.
  const again = await t.start();
  assert.equal(again.isError, true);
  assert.match(text(again), /fix them first/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 2);
});

test("three clean rounds on the current diff are done", async () => {
  const t = setup(offline);
  await t.start();
  for (let i = 1; i <= 2; i++) await t.record({ packets: [packet("none", "no-blocking", i)] });
  assert.match(text(await t.record({ packets: [packet("none", "no-blocking", 3)] })), /next: done/);
});

test("Jev never lowers a blocking finding to one that does not count; it only suggests", async () => {
  const t = setup(jevWith({}, "false-positive"));
  await t.start();
  const r = await t.record({
    packets: [packet("- [blocking] types `a.ts:2` — claim — because", "blocking")],
  });
  assert.match(text(r), /Jev suggests false-positive instead of blocking/);
  assert.match(text(r), /review: 0\/3 clean/);
  assert.match(text(r), /next: fix-findings/);
});

test("Jev may raise a nit that is really a defect", async () => {
  const t = setup(jevWith({}, "should-fix"));
  await t.start();
  const r = await t.record({
    packets: [packet("- [nit] types `a.ts:2` — claim — because", "no-blocking")],
  });
  assert.match(text(r), /nit → should-fix/);
  assert.match(text(r), /review: 0\/3 clean/);
});

test("a packet is recorded once, in the round and slice it was written for", async () => {
  const t = setup(offline);
  await t.start();
  await t.record({ packets: [packet("none", "no-blocking")] });
  const again = await t.record({ packets: [packet("none", "no-blocking")] });
  assert.equal(again.isError, true);
  assert.match(text(again), /round 1.*this is round 2/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 1);
  const other = await t.record({
    packets: [packet("none", "no-blocking", 2).replace("— s1 —", "— other —")],
  });
  assert.equal(other.isError, true);
});

test("a diff that changed since start is refused: the reviewer did not see this code", async () => {
  const t = setup(offline);
  await t.start();
  const r = await t.record({ packets: [packet("none", "no-blocking")], diffDigest: "stale" });
  assert.equal(r.isError, true);
  assert.match(text(r), /diff changed since the review started/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 0);
});

test("untracked files are part of the reviewed change", async () => {
  const withNew = setup(offline, "", true, "src/new.ts\0");
  const r = await withNew.start();
  assert.notEqual(r.isError, true);
  assert.match(text(r), /untracked/);
  const a = await withNew.snapshot();
  const b = await setup(offline, DIFF).snapshot();
  assert.ok(a.ok && b.ok);
  assert.notEqual(a.value.digest, b.value.digest);
  assert.ok("src/new.ts" in a.value.files);
});

test("each start gets its own spawn path, and long odd slice names stay valid", async () => {
  const t = setup(offline);
  t.state.update((s) => ({
    ...s,
    activeSlice: "Slice #1: A very long name that goes on and on and on forever" as SliceRef,
  }));
  const out = text(await t.start());
  const path = /"path":"([^"]+)"/.exec(out)?.[1] ?? "";
  assert.match(path, /^\/[a-z0-9][a-z0-9_-]{0,63}$/);
});

test("a malformed packet is an error naming what is wrong and records nothing", async () => {
  const t = setup(offline);
  await t.start();
  const r = await t.record({ packets: ["I looked and it is fine"] });
  assert.equal(r.isError, true);
  assert.match(text(r), /header/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 0);
});

test("record without any packet is an error", async () => {
  const t = setup(offline);
  assert.equal((await t.record({ packets: [] })).isError, true);
});

test("the start reply names a non-default diffRange so record is called with it", async () => {
  const t = setup(offline);
  assert.doesNotMatch(text(await t.start()), /diffRange/);
  const reply = await t.start({ slice: "s1", diffRange: "HEAD~1..HEAD" });
  assert.match(text(reply), /diffRange "HEAD~1\.\.HEAD"/);
});

test("a review of a range other than HEAD says it does not clear the commit gate", async () => {
  const t = setup(offline);
  await t.start({ slice: "s1", diffRange: "main" });
  const r = await t.record({
    diffRange: "main",
    packets: [packet("none", "no-blocking")],
  });
  assert.match(text(r), /does not clear it/);
  const plain = await t.record({ packets: [packet("none", "no-blocking", 2)] });
  assert.doesNotMatch(text(plain), /does not clear it/);
});

test("the start reply tells the coordinator to pass the slice to record", async () => {
  const t = setup(offline);
  const r = await t.start({ slice: "s1" });
  assert.match(text(r), /devsys_review_record with slice "s1", diffDigest/);
});
