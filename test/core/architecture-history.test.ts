import assert from "node:assert/strict";
import test from "node:test";
import {
  type ArchitectureChange,
  type ArchitectureSnapshot,
  checkArchitectureChange,
  checkArchitectureDelivery,
} from "../../src/core/architecture-history.ts";

const oldArchitecture = "# Architecture\n\nDecisions are pure; I/O lives at the boundary.\n";
const newArchitecture = `${oldArchitecture}\nThe boundary rejects commits that alter merged decisions.\n`;
const decision =
  "# ADR 0001: Boundary\n\n- **Status:** accepted\n\n## Context\nPreserve history.\n";
const first = "docs/adr/0001-boundary.md";
const snapshot = (
  architecture = oldArchitecture,
  entries: readonly (readonly [string, string])[] = [],
): ArchitectureSnapshot => ({
  architecture,
  decisions: new Map(entries),
});
const change = (before: ArchitectureSnapshot, after: ArchitectureSnapshot): ArchitectureChange => ({
  before,
  after,
  mergedPaths: new Set(before.decisions.keys()),
  historicalPaths: new Set(before.decisions.keys()),
});

test("a paired decision passes structural checks but an unchanged architecture does not", () => {
  assert.deepEqual(
    checkArchitectureChange(change(snapshot(), snapshot(newArchitecture, [[first, decision]]))),
    [],
  );
  const violations = checkArchitectureChange(
    change(snapshot(), snapshot(oldArchitecture, [[first, decision]])),
  );
  assert.ok(violations.some((violation) => violation.kind === "architecture-update-required"));
});

test("missing, empty and formatting-only architecture changes do not satisfy pairing", () => {
  for (const architecture of [
    undefined,
    "",
    " \n",
    oldArchitecture.replace("# Architecture", "## **Architecture**"),
  ]) {
    const after: ArchitectureSnapshot = { architecture, decisions: new Map([[first, decision]]) };
    const violations = checkArchitectureChange(change(snapshot(), after));
    assert.ok(
      violations.some((violation) => violation.kind === "architecture-update-required"),
      JSON.stringify(architecture),
    );
  }
});

test("a commit cannot introduce multiple decisions even with a changed architecture", () => {
  const after = snapshot(newArchitecture, [
    [first, decision],
    ["docs/adr/0002-other.md", decision],
  ]);
  assert.ok(
    checkArchitectureChange(change(snapshot(), after)).some(
      (violation) => violation.kind === "multiple-new-adrs",
    ),
  );
});

test("merged records remain exact except linked status-only supersession by this commit", () => {
  const second = "docs/adr/0002-other.md";
  const before = snapshot(oldArchitecture, [[first, decision]]);
  const superseded = decision.replace(
    "- **Status:** accepted",
    "- **Status:** superseded by [ADR 0002](0002-other.md)",
  );
  const valid = snapshot(newArchitecture, [
    [first, superseded],
    [second, decision],
  ]);
  assert.deepEqual(checkArchitectureChange(change(before, valid)), []);
  for (const entries of [
    [[first, `${decision}A correction.\n`]],
    [],
    [["docs/adr/0001-renamed.md", decision]],
    [
      [first, `${superseded}A correction.\n`],
      [second, decision],
    ],
    [[first, superseded]],
  ] satisfies (readonly (readonly [string, string])[])[]) {
    assert.ok(
      checkArchitectureChange(change(before, snapshot(newArchitecture, entries))).length > 0,
      JSON.stringify(entries),
    );
  }
});

test("removed historical identities cannot be reintroduced under the same or renamed path", () => {
  for (const path of [first, "docs/adr/0001-renamed.md"]) {
    const input = change(snapshot(), snapshot(newArchitecture, [[path, decision]]));
    const violations = checkArchitectureChange({ ...input, historicalPaths: new Set([first]) });
    assert.ok(violations.some((violation) => violation.kind === "adr-reintroduced"));
  }
});

test("premerge edits need their own paired update and cannot piggyback another new decision", () => {
  const before = snapshot(oldArchitecture, [[first, decision]]);
  const edited = `${decision}\n## Consequences\nA more precise boundary.\n`;
  const input = change(before, snapshot(newArchitecture, [[first, edited]]));
  assert.deepEqual(
    checkArchitectureChange({ ...input, mergedPaths: new Set(), historicalPaths: new Set() }),
    [],
  );
  assert.ok(
    checkArchitectureChange({
      ...input,
      after: snapshot(oldArchitecture, [[first, edited]]),
      mergedPaths: new Set(),
    }).length > 0,
  );
  assert.ok(
    checkArchitectureChange({
      ...input,
      after: snapshot(newArchitecture, [
        [first, edited],
        ["docs/adr/0002-other.md", decision],
      ]),
      mergedPaths: new Set(),
    }).length > 0,
  );
});

test("unsupported historical records are preserved without rewriting their format", () => {
  const old = "Historical decision in an unknown format.\n";
  const before = snapshot(oldArchitecture, [[first, old]]);
  assert.deepEqual(
    checkArchitectureChange(change(before, snapshot(newArchitecture, [[first, old]]))),
    [],
  );
  assert.ok(
    checkArchitectureChange(
      change(before, snapshot(newArchitecture, [[first, `${old}Correction.\n`]])),
    ).length > 0,
  );
});

test("prospective adoption preserves an untouched historical supersession with an unavailable old target", () => {
  const historical = decision.replace(
    "- **Status:** accepted",
    "- **Status:** superseded by [ADR 0002](0002-other.md)",
  );
  const before = snapshot(oldArchitecture, [[first, historical]]);
  assert.deepEqual(
    checkArchitectureChange(change(before, snapshot(newArchitecture, [[first, historical]]))),
    [],
  );
});

test("current architecture cannot disappear or backlink to a historical decision", () => {
  for (const architecture of [
    undefined,
    "",
    `${oldArchitecture}\nSee [current requirements](docs/adr/0001-boundary.md).\n`,
  ]) {
    const after: ArchitectureSnapshot = { architecture, decisions: new Map() };
    assert.ok(checkArchitectureChange(change(snapshot(), after)).length > 0);
  }
});

test("resulting squash commits cannot combine independently valid sequential decisions", () => {
  const one = snapshot(newArchitecture, [[first, decision]]);
  const two = snapshot(`${newArchitecture}\nA second boundary has its own decision.\n`, [
    [first, decision],
    ["docs/adr/0002-other.md", decision],
  ]);
  const input = { trunk: snapshot(), pending: [one, two], historicalPaths: new Set<string>() };
  assert.deepEqual(checkArchitectureDelivery({ ...input, resulting: [one, two] }), []);
  assert.ok(
    checkArchitectureDelivery({ ...input, resulting: [two] }).some(
      (violation) => violation.kind === "multiple-new-adrs",
    ),
  );
});

test("a pending replacement cannot disappear in a later source commit", () => {
  const trunk = snapshot(oldArchitecture, [[first, decision]]);
  const superseded = decision.replace(
    "- **Status:** accepted",
    "- **Status:** superseded by [ADR 0002](0002-other.md)",
  );
  const replacement = snapshot(newArchitecture, [
    [first, superseded],
    ["docs/adr/0002-other.md", decision],
  ]);
  const dropped = snapshot(`${newArchitecture}\nA later architecture edit.\n`, [
    [first, superseded],
  ]);
  const violations = checkArchitectureDelivery({
    trunk,
    pending: [replacement, dropped],
    resulting: [replacement, dropped],
    historicalPaths: new Set([first]),
  });
  assert.ok(violations.some((violation) => violation.kind === "adr-replacement-missing"));
});

test("squash delivery cannot discard a pending replacement decision or its paired update", () => {
  const trunk = snapshot(oldArchitecture, [[first, decision]]);
  const superseded = decision.replace(
    "- **Status:** accepted",
    "- **Status:** superseded by [ADR 0002](0002-other.md)",
  );
  const replacement = snapshot(newArchitecture, [
    [first, superseded],
    ["docs/adr/0002-other.md", decision],
  ]);
  const input = { trunk, pending: [replacement], historicalPaths: new Set([first]) };
  for (const resulting of [[], [trunk], [snapshot(newArchitecture, [[first, decision]])]]) {
    assert.ok(checkArchitectureDelivery({ ...input, resulting }).length > 0);
  }
  assert.deepEqual(checkArchitectureDelivery({ ...input, resulting: [replacement] }), []);
});
