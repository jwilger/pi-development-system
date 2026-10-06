import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDeparture, renderDepartureMarkdown } from "../../src/core/departure.ts";
import { isParseError } from "../../src/core/types.ts";
import { appendDecision } from "../../src/state/decision-log.ts";

const departure = (id: string, recordedAt: string) => {
  const d = parseDeparture({
    id,
    gate: "tdd.red-first",
    tier: "soft",
    default: "d",
    chosen: "c",
    why: "w",
    costIfWrong: "x",
    approver: "agent",
    scope: { kind: "session" },
    recordedAt,
  });
  if (isParseError(d)) throw new Error(d.message);
  return d;
};

test("appendDecision creates docs/decisions/YYYY-MM.md with a header and the entry", async () => {
  const root = mkdtempSync(join(tmpdir(), "devsys-log-"));
  const d = departure("a", "2026-10-06T17:12:00Z");
  const { path } = await appendDecision(root, d, new Date("2026-10-06T17:12:00Z"));
  assert.equal(path, join(root, "docs", "decisions", "2026-10.md"));
  assert.equal(
    readFileSync(path, "utf8"),
    `# Decisions — 2026-10\n\n${renderDepartureMarkdown(d)}`,
  );
});

test("appendDecision appends to an existing month file without repeating the header", async () => {
  const root = mkdtempSync(join(tmpdir(), "devsys-log-"));
  const first = departure("a", "2026-10-06T17:12:00Z");
  const second = departure("b", "2026-10-07T09:00:00Z");
  await appendDecision(root, first, new Date("2026-10-06T17:12:00Z"));
  const { path } = await appendDecision(root, second, new Date("2026-10-07T09:00:00Z"));
  assert.equal(
    readFileSync(path, "utf8"),
    `# Decisions — 2026-10\n\n${renderDepartureMarkdown(first)}\n${renderDepartureMarkdown(second)}`,
  );
});

test("appendDecision uses the UTC month of `now`", async () => {
  const root = mkdtempSync(join(tmpdir(), "devsys-log-"));
  const { path } = await appendDecision(
    root,
    departure("a", "2026-11-30T23:59:00Z"),
    new Date("2026-11-30T23:59:00Z"),
  );
  assert.match(path, /2026-11\.md$/);
});
