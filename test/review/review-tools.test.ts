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
  (diff: string): Exec =>
  async () => ({ code: 0, stdout: diff, stderr: "" });

const setup = (jev: Jev, diff = "diff --git a/x b/x\n+1\n", withSlice = true) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-review-"));
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  if (withSlice) state.update((s) => ({ ...s, activeSlice: "s1" as SliceRef }));
  const deps = {
    state,
    jev: () => jev,
    exec: exec(diff),
    now: () => new Date("2026-10-06T10:00:00Z"),
  };
  return {
    cwd,
    state,
    start: (p: Record<string, unknown> = {}) =>
      createReviewStartTool(deps).execute("c", p as never, undefined, undefined, fake.ctx as never),
    record: (p: Record<string, unknown>) =>
      createReviewRecordTool(deps).execute(
        "c",
        p as never,
        undefined,
        undefined,
        fake.ctx as never,
      ),
  };
};
const text = (r: { content: readonly { type: string }[] }): string =>
  r.content.map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("\n");

const packet = (findings: string, verdict: string, lenses = "types, tests") =>
  `## Review — s1 — round 1 — lenses: ${lenses}\n### Sources inspected\n- a.ts:1-5\n### Findings\n${findings}\n### Verdict\n${verdict}\n`;

test("start picks Jev lenses, returns an agent_spawn payload and shows 0/3 clean", async () => {
  const t = setup(jevWith({ security: 0.9, types: 0.7 }));
  const r = await t.start();
  assert.notEqual(r.isError, true);
  const out = text(r);
  assert.match(out, /lenses: security, types/);
  assert.match(out, /"type":"reviewer"/);
  assert.match(out, /"path":"\/review-s1-r1"/);
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
    packets: [packet("- [should-fix] tests `a.ts:2` — no test — real defect", "blocking")],
  });
  assert.match(text(r), /review: 0\/3 clean/);
  assert.match(text(r), /next: fix-findings/);
});

test("three clean rounds on the current diff are done", async () => {
  const t = setup(offline);
  await t.start();
  for (let i = 0; i < 3; i++) await t.record({ packets: [packet("none", "no-blocking")] });
  assert.match(text(await t.record({ packets: [packet("none", "no-blocking")] })), /next: done/);
});

test("Jev may move a finding's severity when confident, and the move is reported", async () => {
  const t = setup(jevWith({}, "false-positive"));
  await t.start();
  const r = await t.record({
    packets: [packet("- [blocking] types `a.ts:2` — claim — because", "blocking")],
  });
  assert.match(text(r), /blocking → false-positive/);
  assert.match(text(r), /review: 1\/3 clean/);
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
