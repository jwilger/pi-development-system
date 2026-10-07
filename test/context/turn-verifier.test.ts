import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { registerTurnVerifier } from "../../src/context/turn-verifier.ts";
import { err, ok } from "../../src/core/result.ts";
import type { Phase, SliceRef } from "../../src/core/types.ts";
import type { Jev, JevAvailability } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

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
}) {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  state.update((s) => ({
    ...s,
    phase: opts.phase ?? "implementing",
    ...(opts.slice === undefined ? {} : { activeSlice: opts.slice as SliceRef }),
  }));
  const asked: Asked[] = [];
  const jev: Jev = {
    ask: async (s, questions) => {
      asked.push({ state: s, questions: Object.keys(questions) });
      return opts.jevFails === true
        ? err({ kind: "provider", message: "x" })
        : ok({ claim: bool(opts.claim ?? 0), drift: bool(opts.drift ?? 0) });
    },
    availability: () => opts.availability ?? "online",
    model: () => "fake/jev",
  };
  registerTurnVerifier({ pi: fake.api, state, jev: () => jev, maxPerSession: () => opts.max ?? 6 });
  const toolResult = (toolName: string, text: string, isError = false) =>
    fake.emit({
      type: "tool_result",
      toolName,
      toolCallId: "c",
      input: {},
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
  return { fake, state, asked, toolResult, turnEnd, agentStart };
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
  assert.equal(evidence.length, 2);
  assert.match(evidence[0] ?? "", /^bash exit 1: /);
  assert.match(evidence[1] ?? "", /^read: /);
  await t.agentStart();
  await t.turnEnd("Tests pass.");
  assert.deepEqual(t.asked[1]?.state.toolEvidence, []);
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
