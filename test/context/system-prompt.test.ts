import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPromptSection } from "../../src/context/system-prompt.ts";
import { initialState } from "../../src/core/types.ts";

const nonNegotiables = readFileSync(
  new URL("../../principles/NON-NEGOTIABLES.md", import.meta.url),
  "utf8",
);

test("section contains all ten non-negotiable headings and the current phase", () => {
  const section = buildPromptSection({ ...initialState(), phase: "implementing" }, nonNegotiables);
  for (let n = 1; n <= 10; n++) {
    assert.match(section, new RegExp(`^## ${n}\\. `, "m"), `missing heading ${n}`);
  }
  assert.match(section, /phase: implementing/);
});

test("section reports open departures and Jev status", () => {
  const section = buildPromptSection({ ...initialState(), jev: "offline" }, nonNegotiables);
  assert.match(section, /open departures: 0/);
  assert.match(section, /jev: offline/);
});

test("non-negotiables file stays within 60 lines", () => {
  assert.ok(nonNegotiables.split("\n").length <= 60);
});
