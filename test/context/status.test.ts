import assert from "node:assert/strict";
import { test } from "node:test";
import { renderStatus, renderStatusLine } from "../../src/context/status.ts";
import { initialState } from "../../src/core/types.ts";

test("status line shows phase and jev status", () => {
  assert.equal(
    renderStatusLine({ ...initialState(), phase: "planning", jev: "online" }),
    "devsys: planning · jev online",
  );
});

test("status report lists phase, sizing, slice, departures and jev", () => {
  const text = renderStatus({ ...initialState(), sizing: "change" });
  assert.match(text, /phase: idle/);
  assert.match(text, /sizing: change/);
  assert.match(text, /active slice: none/);
  assert.match(text, /open departures: 0/);
  assert.match(text, /jev: unknown/);
});
