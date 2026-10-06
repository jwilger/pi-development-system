import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, isParseError } from "../../src/core/types.ts";
import { createSessionState, parseDevsysState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("after two updates and rebuildFrom(entries), get() equals the second state", () => {
  const fake = createFakePi();
  const store = createSessionState(fake.api);
  store.update((s) => ({ ...s, phase: "planning" }));
  store.update((s) => ({ ...s, phase: "implementing", jev: "online" }));
  assert.equal(fake.entries.length, 2);

  const fresh = createSessionState(createFakePi().api);
  fresh.rebuildFrom(fake.entries);
  assert.equal(fresh.get().phase, "implementing");
  assert.equal(fresh.get().jev, "online");
});

test("rebuildFrom ignores unrelated and malformed entries and falls back to initial state", () => {
  const store = createSessionState(createFakePi().api);
  store.update((s) => ({ ...s, phase: "reviewing" }));
  store.rebuildFrom([
    { customType: "other", data: { phase: "delivering" } },
    { customType: "devsys-state", data: { phase: "nonsense" } },
  ]);
  assert.deepEqual(store.get(), initialState());
});

test("parseDevsysState rejects non-objects and unknown phases", () => {
  assert.equal(isParseError(parseDevsysState(null)), true);
  assert.equal(
    isParseError(parseDevsysState({ phase: "x", openDepartures: [], jev: "online" })),
    true,
  );
});

test("parseDevsysState rejects openDepartures whose elements are not records", () => {
  const base = { phase: "idle", jev: "online" };
  assert.equal(isParseError(parseDevsysState({ ...base, openDepartures: [null] })), true);
  assert.equal(isParseError(parseDevsysState({ ...base, openDepartures: [1, "x"] })), true);
});

test("onChange listeners run after every update", () => {
  const store = createSessionState(createFakePi().api);
  const seen: string[] = [];
  store.onChange((s) => seen.push(s.phase));
  store.update((s) => ({ ...s, phase: "planning" }));
  store.update((s) => ({ ...s, phase: "reviewing" }));
  assert.deepEqual(seen, ["planning", "reviewing"]);
});
