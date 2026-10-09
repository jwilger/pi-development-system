import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import type { Exec } from "../../src/core/exec.ts";
import { err, ok } from "../../src/core/result.ts";
import type { Finding } from "../../src/core/review.ts";
import type { SliceRef } from "../../src/core/types.ts";
import type { Jev } from "../../src/jev/client.ts";
import { snapshotDiff } from "../../src/review/digest.ts";
import { createReviewRecordTool, createReviewStartTool } from "../../src/review/review-tools.ts";
import { createSubmissionStore } from "../../src/review/submissions.ts";
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

const fakeGitOutput = (args: string[], diff: string, untracked: string): string => {
  if (args.includes("ls-files")) return untracked;
  if (args.includes("hash-object")) return "abc123\n";
  return diff;
};

const exec =
  (diff: string, untracked = ""): Exec =>
  async (_command, args) => ({
    code: 0,
    stdout: fakeGitOutput(args, diff, untracked),
    stderr: "",
  });

const DIFF = "diff --git a/x b/x\n+1\n";
const setup = (jev: Jev, diff = DIFF, withSlice = true, untracked = "") => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-review-"));
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  if (withSlice) state.update((s) => ({ ...s, activeSlice: "s1" as SliceRef }));
  const submissions = createSubmissionStore();
  const deps = {
    state,
    submissions,
    jev: () => jev,
    exec: exec(diff, untracked),
    now: () => new Date("2026-10-06T10:00:00Z"),
  };
  return {
    cwd,
    state,
    submissions,
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

test("the reviewer's effort comes from [review] thinking_level, high by default", async () => {
  const t = setup(offline);
  assert.match(text(await t.start()), /"thinkingLevel":"high"/);
  writeFileSync(join(t.cwd, ".development-system.toml"), '[review]\nthinking_level = "xhigh"\n');
  assert.match(text(await t.start()), /"thinkingLevel":"xhigh"/);
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

test("record counts clean rounds, reports nits back and gives the next action", async () => {
  const t = setup(offline);
  await t.start();
  const r = await t.record({
    packets: [packet("- [nit] types `a.ts:2` — rename — clearer", "no-blocking")],
  });
  assert.notEqual(r.isError, true);
  assert.match(text(r), /review: 1\/3 clean/);
  assert.match(text(r), /next: review/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 1);
  assert.match(text(r), /nit types `a\.ts:2` — rename/);
  assert.equal(existsSync(join(t.cwd, "docs/decisions/followups.md")), false);
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

const inPhase = (t: ReturnType<typeof setup>, phase: "implementing" | "planning" | "idle") =>
  t.state.update((s) => ({ ...s, phase }));
const clean = (round: number) => packet("- none", "no-blocking", round);

test("starting a review takes an implementing slice into reviewing", async () => {
  const t = setup(offline);
  inPhase(t, "implementing");
  await t.start();
  assert.equal(t.state.get().phase, "reviewing");
});

test("a satisfied review moves the slice to delivering; a later finding takes it back", async () => {
  const t = setup(offline);
  inPhase(t, "implementing");
  for (const round of [1, 2, 3]) {
    await t.start();
    await t.record({ packets: [clean(round)] });
    assert.equal(t.state.get().phase, round === 3 ? "delivering" : "reviewing");
  }
  // Starting again on the same diff is "already satisfied": still delivering.
  assert.match(text(await t.start()), /already satisfied/);
  assert.equal(t.state.get().phase, "delivering");
});

test("a round with a blocking finding leaves the slice in reviewing", async () => {
  const t = setup(offline);
  inPhase(t, "implementing");
  await t.start();
  await t.record({
    packets: [packet("- [blocking] types `a.ts:1` — bad — it breaks", "blocking", 1)],
  });
  assert.equal(t.state.get().phase, "reviewing");
});

test("reviewing a slice that is not in flight does not change the phase", async () => {
  for (const phase of ["planning", "idle"] as const) {
    const t = setup(offline);
    inPhase(t, phase);
    await t.start();
    assert.equal(t.state.get().phase, phase);
  }
});

const submitted = (
  round = 1,
  findings: Finding[] = [],
  verdict: "no-blocking" | "blocking" = "no-blocking",
) => ({
  slice: "s1",
  round,
  lenses: ["types"],
  sources: ["a.ts:1-5"],
  findings,
  verdict,
});

test("record reads the submitted result when no packets are passed, then forgets it", async () => {
  const t = setup(offline);
  await t.start();
  t.submissions.put(submitted());
  const r = await t.record({});
  assert.notEqual(r.isError, true);
  assert.match(text(r), /review: 1\/3 clean/);
  assert.equal(t.state.get().reviews?.[0]?.rounds.length, 1);
  assert.equal(t.submissions.forRound("s1", 1).length, 0);
  assert.equal((await t.record({})).isError, true);
});

test("submitted findings count like markdown ones", async () => {
  const t = setup(offline);
  await t.start();
  t.submissions.put(
    submitted(
      1,
      [
        {
          id: "types-1",
          severity: "should-fix",
          path: "a.ts",
          line: 2,
          summary: "no test",
          lens: "types",
        },
      ],
      "blocking",
    ),
  );
  const r = await t.record({});
  assert.match(text(r), /review: 0\/3 clean/);
  assert.match(text(r), /next: fix-findings/);
});

test("submitted and markdown packets for one round are recorded together", async () => {
  const t = setup(offline);
  await t.start();
  t.submissions.put(submitted());
  const r = await t.record({ packets: [packet("none", "no-blocking", 1, "tests")] });
  assert.notEqual(r.isError, true);
  assert.deepEqual(t.state.get().reviews?.[0]?.rounds[0]?.lenses, ["tests", "types"]);
});

test("with nothing submitted and no packets the refusal names both ways to hand over a result", async () => {
  const t = setup(offline);
  await t.start();
  const r = await t.record({});
  assert.equal(r.isError, true);
  assert.match(text(r), /devsys_submit_review/);
  assert.match(text(r), /packets/);
});

test("starting a round discards submissions left from an earlier attempt", async () => {
  const t = setup(offline);
  t.submissions.put(submitted());
  await t.start();
  assert.equal(t.submissions.forRound("s1", 1).length, 0);
});

test("a submission refused for the diff having changed stays available for a later record", async () => {
  const t = setup(offline);
  await t.start();
  t.submissions.put(submitted());
  const stale = await t.record({ diffDigest: "stale" });
  assert.equal(stale.isError, true);
  assert.equal(t.submissions.forRound("s1", 1).length, 1);
});

test("start tells the coordinator the reviewer submits its result; record needs no packets", async () => {
  const t = setup(offline);
  const out = text(await t.start());
  assert.match(out, /devsys_submit_review/);
  assert.doesNotMatch(out, /pass its packet/);
});

test("a non-packet in `packets` beside a submitted result is refused with a hint to drop it", async () => {
  const t = setup(offline);
  await t.start();
  t.submissions.put(submitted());
  const r = await t.record({ packets: ["Done, no findings."] });
  assert.equal(r.isError, true);
  assert.match(text(r), /malformed/);
  assert.match(text(r), /submitted result.*omit `packets`/);
  assert.equal(t.submissions.forRound("s1", 1).length, 1);
  assert.notEqual((await t.record({})).isError, true);
});

test("a markdown packet for the lenses already submitted is dropped, not recorded twice", async () => {
  const t = setup(offline);
  await t.start();
  t.submissions.put(
    submitted(1, [{ id: "types-1", severity: "nit", summary: "naming", lens: "types" }]),
  );
  const r = await t.record({
    packets: [packet("- [nit] types `a.ts:2` — naming — clearer", "no-blocking", 1, "types")],
  });
  assert.notEqual(r.isError, true);
  assert.match(text(r), /1 nit/);
  assert.match(text(r), /dropped.*submitted/i);
  assert.equal(t.state.get().reviews?.[0]?.rounds[0]?.findings.length, 1);
});
