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

test("the status line shows the last observed CI state; unknown stays quiet", () => {
  const base = { ...initialState(), jev: "offline" as const };
  assert.equal(
    renderStatusLine({ ...base, ci: { status: "red", sha: "abcdef1234" } }),
    "devsys: idle · jev offline · ci red (abcdef1)",
  );
  assert.equal(
    renderStatusLine({ ...base, ci: { status: "pending" } }),
    "devsys: idle · jev offline · ci pending",
  );
  assert.equal(
    renderStatusLine({ ...base, ci: { status: "unknown" } }),
    "devsys: idle · jev offline",
  );
  assert.match(
    renderStatus({ ...base, ci: { status: "green", sha: "abcdef1234" } }),
    /- ci: green \(abcdef1\)/,
  );
});
