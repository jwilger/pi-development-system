import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPrinciplesSection, buildStateSection } from "../../src/context/system-prompt.ts";
import { parseDeparture } from "../../src/core/departure.ts";
import { initialState, isParseError } from "../../src/core/types.ts";

const nonNegotiables = readFileSync(
  new URL("../../principles/NON-NEGOTIABLES.md", import.meta.url),
  "utf8",
);

const departure = (n: number) => {
  const d = parseDeparture({
    id: `d${n}`,
    gate: "tests.weaken",
    tier: "soft",
    default: "x",
    chosen: `choice ${n}\nwith a break`,
    why: "w",
    costIfWrong: "c",
    approver: "agent",
    scope: { kind: "session" },
    recordedAt: "2026-10-06T17:12:00Z",
  });
  if (isParseError(d)) throw new Error(d.message);
  return d;
};

test("the principles section holds the ten non-negotiables and nothing that moves", () => {
  const section = buildPrinciplesSection(nonNegotiables);
  for (let n = 1; n <= 10; n++) {
    assert.match(section, new RegExp(`^## ${n}\\. `, "m"), `missing heading ${n}`);
  }
  assert.doesNotMatch(section, /phase:|jev:|Current state/);
});

test("the state section names phase, sizing, slice and profiles, never Jev availability", () => {
  const section = buildStateSection({
    ...initialState(),
    phase: "implementing",
    sizing: "change",
    profiles: ["typescript"],
    jev: "offline",
  });
  assert.match(section, /^- phase: implementing$/m);
  assert.match(section, /^- sizing: change$/m);
  assert.match(section, /^- active slice: none$/m);
  assert.match(section, /^- profiles: typescript$/m);
  assert.match(section, /^- open departures: none$/m);
  assert.doesNotMatch(section, /jev|offline/i);
  assert.match(section, /devsys_record_departure/);
});

test("open departures are listed by gate and choice on one line each, bounded", () => {
  const open = Array.from({ length: 14 }, (_, i) => departure(i));
  const section = buildStateSection({ ...initialState(), openDepartures: open });
  assert.match(section, /^ {2}- tests\.weaken — choice 0 with a break \(session\)$/m);
  assert.match(section, /…and 2 more/);
  assert.equal(section.split("\n").filter((l) => l.startsWith("  - ")).length, 13);
});

test("a Jev flap or a slice elsewhere does not change the bytes of either section", () => {
  const a = { ...initialState(), phase: "implementing" as const };
  const b = { ...a, jev: "offline" as const };
  assert.equal(buildStateSection(a), buildStateSection(b));
  assert.equal(buildPrinciplesSection(nonNegotiables), buildPrinciplesSection(nonNegotiables));
});

test("non-negotiables file stays within 60 lines", () => {
  assert.ok(nonNegotiables.split("\n").length <= 60);
});
