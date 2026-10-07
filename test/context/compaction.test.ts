import assert from "node:assert/strict";
import test from "node:test";
import { registerCompactionResync } from "../../src/context/compaction.ts";
import { renderStateBlock } from "../../src/context/state-block.ts";
import { type DevsysState, initialState, type SliceRef } from "../../src/core/types.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const busy: DevsysState = {
  ...initialState(),
  phase: "implementing",
  sizing: "change",
  activeSlice: "I7.3" as SliceRef,
  lastPushAt: "2026-10-06T17:00:00.000Z",
  lastTestRun: { at: "2026-10-06T17:10:00.000Z", exitCode: 1, summary: "1 passed | 2 failed" },
};

test("the state block names phase, sizing, slice, last test run and last push", () => {
  const block = renderStateBlock(busy);
  assert.match(block, /^## Development System State/);
  assert.match(block, /phase: implementing/);
  assert.match(block, /sizing: change/);
  assert.match(block, /slice: I7\.3/);
  assert.match(block, /last test run: exit 1 — 1 passed \| 2 failed/);
  assert.match(block, /last push: 2026-10-06T17:00:00\.000Z/);
});

test("unset values render as 'none' and an empty state is still a valid block", () => {
  const block = renderStateBlock(initialState());
  assert.match(block, /slice: none/);
  assert.match(block, /last test run: none/);
  assert.match(block, /last push: none/);
  assert.match(block, /open departures: none/);
});

test("open departures list their gates, capped", () => {
  const departure = (i: number) => ({
    id: `d${i}`,
    gate: "scope.expansion",
    chosen: `c${i}`,
    why: "w",
    costIfWrong: "x",
    scope: { kind: "session" },
    at: "2026-10-06T17:00:00.000Z",
    revisitWhen: undefined,
  });
  const state = {
    ...busy,
    openDepartures: Array.from({ length: 12 }, (_, i) => departure(i)),
  } as unknown as DevsysState;
  const block = renderStateBlock(state);
  assert.match(block, /open departures: 12/);
  assert.match(block, /…and 5 more/);
});

test("after compaction one resync message carries the state block", async () => {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  state.update(() => busy);
  registerCompactionResync({ pi: fake.api, state });
  await fake.emit({ type: "session_compact", reason: "manual", willRetry: false } as never);
  assert.equal(fake.sentMessages.length, 1);
  const sent = JSON.stringify(fake.sentMessages[0]);
  assert.match(sent, /devsys resync/);
  assert.match(sent, /Development System State/);
  assert.match(sent, /phase: implementing/);
});

test("an idle session with no departures is not resynced", async () => {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  registerCompactionResync({ pi: fake.api, state });
  await fake.emit({ type: "session_compact", reason: "threshold", willRetry: false } as never);
  assert.equal(fake.sentMessages.length, 0);
});
