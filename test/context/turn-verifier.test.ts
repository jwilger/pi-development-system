import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { asksUser, registerTurnVerifier } from "../../src/context/turn-verifier.ts";
import { err, ok } from "../../src/core/result.ts";
import { addRound, startReview } from "../../src/core/review.ts";
import type { Phase, SliceRef } from "../../src/core/types.ts";
import type { Jev, JevAvailability } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";
import { fakeBearerHeader } from "../harness/fake-secrets.ts";

type Asked = { state: Record<string, unknown>; questions: string[] };
const bool = (probability: number): ClassifierAnswer => ({ type: "bool", probability });

function setup(opts: {
  phase?: Phase;
  claim?: number;
  drift?: number;
  jevFails?: boolean;
  availability?: JevAvailability;
  slice?: string;
  max?: number;
  done?: number;
  reviewed?: boolean;
}) {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  state.update((s) => ({
    ...s,
    phase: opts.phase ?? "implementing",
    ...(opts.slice === undefined ? {} : { activeSlice: opts.slice as SliceRef }),
    ...(opts.reviewed === true && opts.slice !== undefined
      ? {
          reviews: [
            addRound(startReview(opts.slice as SliceRef, 2), {
              lenses: ["correctness"],
              findings: [],
              reviewedAt: "2026-01-01T00:00:00Z",
              diffDigest: "d",
            }),
          ],
        }
      : {}),
  }));
  const asked: Asked[] = [];
  const jev: Jev = {
    ask: async (s, questions) => {
      asked.push({ state: s, questions: Object.keys(questions) });
      return opts.jevFails === true
        ? err({ kind: "provider", message: "x" })
        : ok({
            claim: bool(opts.claim ?? 0),
            drift: bool(opts.drift ?? 0),
            done: bool(opts.done ?? 0),
          });
    },
    availability: () => opts.availability ?? "online",
    model: () => "fake/jev",
  };
  registerTurnVerifier({ pi: fake.api, state, jev: () => jev, maxPerSession: () => opts.max ?? 6 });
  const toolResult = (
    toolName: string,
    text: string,
    isError = false,
    command?: string,
    path?: string,
  ) =>
    fake.emit({
      type: "tool_result",
      toolName,
      toolCallId: "c",
      input: {
        ...(command === undefined ? {} : { command }),
        ...(path === undefined ? {} : { path }),
      },
      content: [{ type: "text", text }],
      isError,
      details: undefined,
    } as never);
  const turnEnd = (
    text: string,
    extra: { toolCall?: boolean; turnIndex?: number; outcome?: string } = {},
  ) =>
    fake.emit({
      type: "turn_end",
      outcome: extra.outcome ?? "completed",
      turnIndex: extra.turnIndex ?? 0,
      message: {
        role: "assistant",
        content: [
          { type: "text", text },
          ...(extra.toolCall === true
            ? [{ type: "toolCall", id: "t", name: "bash", arguments: {} }]
            : []),
        ],
      },
      toolResults: [],
    } as never);
  const agentStart = () => fake.emit({ type: "agent_start" } as never);
  const setDepartures = (openDepartures: never[]) =>
    state.update((st) => ({ ...st, openDepartures }));
  return { fake, state, asked, toolResult, turnEnd, agentStart, setDepartures };
}

const textOf = (result: unknown): string =>
  JSON.stringify((result as { entries: unknown[] }).entries);

test("an unverified claim forces one corrective continuation", async () => {
  const t = setup({ claim: 0.9 });
  const r = (await t.turnEnd("All tests pass.")) as { continue: boolean; entries: unknown[] };
  assert.equal(r.continue, true);
  assert.equal(r.entries.length, 1);
  assert.match(textOf(r), /custom_message/);
  assert.match(textOf(r), /no tool evidence/);
});

test("below the 0.75 threshold nothing happens", async () => {
  const t = setup({ claim: 0.74 });
  assert.equal(await t.turnEnd("All tests pass."), undefined);
});

test("drift from the active slice asks for a return or a scope.expansion departure", async () => {
  const t = setup({ drift: 0.8, slice: "I7" });
  const r = await t.turnEnd("Also refactoring auth.");
  assert.match(textOf(r), /scope\.expansion/);
  assert.match(textOf(r), /I7/);
});

test("claim and drift together still make one continuation with both messages", async () => {
  const t = setup({ claim: 0.9, drift: 0.9, slice: "I7" });
  const r = (await t.turnEnd("Done, and refactored auth.")) as { entries: unknown[] };
  assert.equal(r.entries.length, 2);
});

test("only implementing, reviewing and delivering are verified, and Jev is not asked otherwise", async () => {
  for (const phase of ["idle", "intake", "planning"] as const) {
    const t = setup({ phase, claim: 1 });
    assert.equal(await t.turnEnd("All tests pass."), undefined);
    assert.equal(t.asked.length, 0);
  }
  for (const phase of ["implementing", "reviewing", "delivering"] as const) {
    const t = setup({ phase, claim: 1 });
    assert.ok(await t.turnEnd("All tests pass."));
  }
});

test("the delivery report is still verified when the push in the same run closed the slice", async () => {
  const t = setup({ claim: 1 });
  t.agentStart();
  t.state.update((s) => ({ ...s, phase: "idle" }));
  assert.ok(await t.turnEnd("Pushed. All tests pass."));
  const whole = setup({ phase: "idle", claim: 1 });
  whole.agentStart();
  whole.state.update((st) => ({ ...st, phase: "implementing" }));
  whole.toolResult("bash", "pushed", false, "git push");
  whole.state.update((st) => ({ ...st, phase: "idle" }));
  assert.ok(await whole.turnEnd("Pushed. All tests pass."), "a slice begun and closed in one run");
  const later = setup({ phase: "idle", claim: 1 });
  later.agentStart();
  assert.equal(await later.turnEnd("All tests pass."), undefined);
});

test("a turn that still calls tools is not judged; evidence may be on its way", async () => {
  const t = setup({ claim: 1 });
  assert.equal(
    await t.turnEnd("Running tests now, all pass so far.", { toolCall: true }),
    undefined,
  );
  assert.equal(t.asked.length, 0);
});

test("a message that asks the user a question is never corrected", async () => {
  const t = setup({ claim: 1 });
  assert.equal(await t.turnEnd("The tests pass. Shall I commit?"), undefined);
  assert.equal(await t.turnEnd("All tests pass. Should I commit? (y/n)"), undefined);
  assert.equal(
    await t.turnEnd("All tests pass. Which do you prefer?\n1. squash\n2. keep commits"),
    undefined,
  );
  assert.equal(t.asked.length, 0);
});

test("Jev offline or failing never blocks and never continues", async () => {
  const offline = setup({ claim: 1, availability: "offline" });
  assert.equal(await offline.turnEnd("All tests pass."), undefined);
  assert.equal(offline.asked.length, 0);
  const failing = setup({ claim: 1, jevFails: true });
  assert.equal(await failing.turnEnd("All tests pass."), undefined);
});

test("tool results since the agent started are passed to Jev as evidence", async () => {
  const t = setup({ claim: 0 });
  await t.agentStart();
  await t.toolResult("bash", "ℹ fail 2", true);
  await t.toolResult("read", "file text");
  await t.turnEnd("Tests pass.");
  const evidence = t.asked[0]?.state.toolEvidence as string[];
  assert.match(evidence[0] ?? "", /^bash exit 1:/);
});

test("evidence from an earlier run never backs a claim in a later run", async () => {
  const t = setup({ claim: 0 });
  await t.agentStart();
  await t.toolResult("bash", "ℹ pass 14", false, "npm test");
  await t.turnEnd("Tests pass.");
  await t.agentStart();
  await t.turnEnd("All tests pass.");
  assert.deepEqual(t.asked[1]?.state.toolEvidence, []);
});

test("a question whose options are themselves questions, or end on a colon lead-in, is a question", async () => {
  const t = setup({ claim: 1 });
  assert.equal(
    await t.turnEnd("All tests pass. Want me to:\n1. Push now?\n2. Open a PR?"),
    undefined,
  );
  assert.equal(await t.turnEnd("All tests pass. Which next:\n- push\n- open a PR"), undefined);
  assert.equal(t.asked.length, 0);
});

test("a status summary ending in a colon-led list is still judged, not mistaken for a question", async () => {
  const t = setup({ claim: 1 });
  const r = await t.turnEnd("Done. Summary:\n- Fixed the parser\n- All 42 tests pass\n- Committed");
  assert.ok(r);
  assert.equal(asksUser("Changes:\n\n1. Fixed parser\n2. All tests pass"), false);
  assert.equal(asksUser("I ran it:\n- a\n- b"), false);
});

test("a tool-calling turn after a correction does not use up the no-repeat rule", async () => {
  const t = setup({ claim: 1 });
  assert.ok(await t.turnEnd("All tests pass.", { turnIndex: 0 }));
  assert.equal(await t.turnEnd("Running it.", { toolCall: true, turnIndex: 1 }), undefined);
  assert.equal(await t.turnEnd("All tests pass now.", { turnIndex: 2 }), undefined);
  assert.equal(t.asked.length, 1);
});

test("the turn right after a correction is not corrected again", async () => {
  const t = setup({ claim: 1 });
  assert.ok(await t.turnEnd("All tests pass.", { turnIndex: 0 }));
  assert.equal(await t.turnEnd("Still, all tests pass.", { turnIndex: 1 }), undefined);
  assert.ok(await t.turnEnd("All tests pass again.", { turnIndex: 2 }));
});

test("at most maxPerSession corrections per session; the count resets on a new session", async () => {
  const t = setup({ claim: 1, max: 2 });
  for (let i = 0; i < 4; i++) {
    await t.agentStart(); // clears the no-twice-in-a-row rule so only the cap can refuse
    await t.turnEnd("pass", { turnIndex: i });
  }
  assert.equal(t.asked.length, 2);
  await t.fake.emit({ type: "session_start", reason: "new" } as never);
  assert.ok(await t.turnEnd("pass", { turnIndex: 0 }));
});

test("an aborted or errored turn is never judged and spends no correction", async () => {
  const t = setup({ claim: 1, max: 1 });
  assert.equal(await t.turnEnd("All tests pass.", { outcome: "aborted" }), undefined);
  assert.equal(await t.turnEnd("All tests pass.", { outcome: "error" }), undefined);
  assert.equal(t.asked.length, 0);
  assert.ok(await t.turnEnd("All tests pass."));
});

test("assistant messages without text and non-assistant messages are ignored", async () => {
  const t = setup({ claim: 1 });
  await t.fake.emit({
    type: "turn_end",
    turnIndex: 0,
    message: { role: "user", content: "hi" },
    toolResults: [],
  } as never);
  await t.fake.emit({
    type: "turn_end",
    turnIndex: 0,
    message: { role: "assistant", content: [] },
    toolResults: [],
  } as never);
  assert.equal(t.asked.length, 0);
});

test("a failing run piped through tail reaches Jev as a failure, not exit 0", async () => {
  const t = setup({ claim: 0 });
  await t.toolResult(
    "bash",
    "ℹ fail 2\nℹ skipped 15\nℹ duration_ms 6792",
    false,
    "npm test 2>&1 | tail -3",
  );
  await t.turnEnd("All tests pass.");
  const evidence = t.asked[0]?.state.toolEvidence as string[];
  assert.match(evidence[0] ?? "", /^bash exit 1:/);
});

test("evidence names the command or file, so a silent passing check is not mistaken for nothing", async () => {
  const t = setup({ claim: 0 });
  await t.toolResult("bash", "(no output)", false, "npx tsc --noEmit");
  await t.toolResult("read", "export const a = 1;", false, undefined, "src/a.ts");
  await t.turnEnd("Type-check is clean.");
  const evidence = t.asked[0]?.state.toolEvidence as string[];
  assert.match(evidence[0] ?? "", /npx tsc --noEmit/);
  assert.match(evidence[1] ?? "", /src\/a\.ts/);
});

test("a secret in the command never reaches Jev as evidence", async () => {
  const t = setup({ claim: 0 });
  await t.toolResult(
    "bash",
    "ok",
    false,
    `curl -H '${fakeBearerHeader("abcdef1234567890abcdef")}' x`,
  );
  await t.turnEnd("Done.");
  assert.doesNotMatch(JSON.stringify(t.asked[0]?.state.toolEvidence), /abcdef1234567890abcdef/);
});

test("drift is not re-flagged once a scope.expansion departure covers the slice or session", async () => {
  const dep = (scope: unknown) =>
    ({
      id: "d1",
      gate: "scope.expansion",
      tier: "soft",
      default: "x",
      chosen: "y",
      why: "z",
      costIfWrong: "c",
      approver: "agent",
      scope,
      recordedAt: "2026-10-07T00:00:00Z",
    }) as never;
  const covered = setup({ drift: 1, slice: "S1" });
  covered.setDepartures([dep({ kind: "slice", slice: "S1" })]);
  assert.equal(await covered.turnEnd("Also refactored billing."), undefined);
  const other = setup({ drift: 1, slice: "S1" });
  other.setDepartures([dep({ kind: "slice", slice: "S2" })]);
  assert.ok(await other.turnEnd("Also refactored billing."));
  const session = setup({ drift: 1, slice: "S1" });
  session.setDepartures([dep({ kind: "session" })]);
  assert.equal(await session.turnEnd("Also refactored billing."), undefined);
});

test("a finished slice with no review round is told to start a review", async () => {
  const t = setup({ done: 0.9, slice: "I7" });
  const r = await t.turnEnd("The slice is done and ready to commit.");
  assert.match(textOf(r), /devsys_review_start/);
  assert.match(textOf(r), /I7/);
});

test("once a round is recorded for the slice the review nudge stays quiet and is not even asked", async () => {
  const t = setup({ done: 0.9, slice: "I7", reviewed: true });
  assert.equal(await t.turnEnd("The slice is done and ready to commit."), undefined);
  assert.equal(t.asked[0]?.questions.includes("done"), false);
});

test("a finished claim below the threshold, or outside implementing, earns no review nudge", async () => {
  assert.equal(await setup({ done: 0.7, slice: "I7" }).turnEnd("Done."), undefined);
  const delivering = setup({ done: 0.9, slice: "I7", phase: "delivering" });
  assert.equal(await delivering.turnEnd("Done."), undefined);
  assert.equal(delivering.asked[0]?.questions.includes("done"), false);
});

test("a review nudge shares one continuation with a claim correction", async () => {
  const t = setup({ claim: 0.9, done: 0.9, slice: "I7" });
  const r = (await t.turnEnd("All done, tests pass.")) as { entries: unknown[] };
  assert.equal(r.entries.length, 2);
});

test("a review waived by a review.unsatisfied departure is not asked for again", async () => {
  const waiver = (scope: unknown) =>
    ({
      id: "w1",
      gate: "review.unsatisfied",
      tier: "soft",
      default: "x",
      chosen: "skip review for this fix",
      why: "user approved",
      costIfWrong: "c",
      approver: "user",
      scope,
      recordedAt: "2026-10-07T00:00:00Z",
    }) as never;
  const waived = setup({ done: 0.9, slice: "S1" });
  waived.setDepartures([waiver({ kind: "slice", slice: "S1" })]);
  assert.equal(await waived.turnEnd("Done."), undefined);
  assert.equal(waived.asked[0]?.questions.includes("done"), false);
  const other = setup({ done: 0.9, slice: "S1" });
  other.setDepartures([waiver({ kind: "slice", slice: "S2" })]);
  assert.match(textOf(await other.turnEnd("Done.")), /devsys_review_start/);
});
