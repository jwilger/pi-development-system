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

test("online status names the Jev model; offline does not", () => {
  assert.equal(
    renderStatusLine({ ...initialState(), jev: "online" }, "typesafe/jev-latest"),
    "devsys: idle · jev online (typesafe/jev-latest)",
  );
  assert.match(renderStatus({ ...initialState(), jev: "online" }, "a/b"), /jev: online \(a\/b\)/);
  assert.equal(
    renderStatusLine({ ...initialState(), jev: "offline" }),
    "devsys: idle · jev offline",
  );
});
