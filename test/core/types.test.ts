import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, isParseError, parseGateId } from "../../src/core/types.ts";

test("parseGateId rejects an empty string", () => {
  const result = parseGateId("");
  assert.equal(isParseError(result), true);
});

test("parseGateId accepts dotted kebab-case ids", () => {
  const result = parseGateId("git.history-rewrite");
  assert.equal(isParseError(result), false);
  assert.equal(result, "git.history-rewrite");
});

test("parseGateId accepts a qualified id and rejects whitespace and upper case", () => {
  assert.equal(isParseError(parseGateId("artifact.skipped:brief")), false);
  assert.equal(isParseError(parseGateId("Git.Force")), true);
  assert.equal(isParseError(parseGateId("git force")), true);
  assert.equal(isParseError(parseGateId("nodot")), true);
});

test("initialState is idle with no open departures and unknown Jev", () => {
  const state = initialState();
  assert.equal(state.phase, "idle");
  assert.deepEqual(state.openDepartures, []);
  assert.equal(state.jev, "unknown");
});
