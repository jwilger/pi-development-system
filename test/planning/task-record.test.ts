import assert from "node:assert/strict";
import test from "node:test";
import { isParseError } from "../../src/core/types.ts";
import { parseTaskRecord } from "../../src/planning/task-record.ts";

const GOOD = `## T1 — Trim emails on login
**Goal:** Logging in with a trailing space in the email succeeds.
**Files:** src/auth/login.ts, test/auth/login.test.ts
**Interfaces:** \`normalizeEmail(raw: string): string\`
**First failing test:** test/auth/login.test.ts "trims trailing whitespace" asserts login resolves.
**Steps:**
1. Add the failing test.
2. Add normalizeEmail and call it in login.
3. Run the suite.
**Run:** \`npm test -- test/auth/login.test.ts\`
**Expected:** 1 test passes, 0 fail.
**Out of scope:** password handling.
`;

const without = (section: string): string =>
  GOOD.split("\n")
    .filter((l) => !l.startsWith(`**${section}:**`))
    .join("\n");

test("a complete record parses into its sections", () => {
  const r = parseTaskRecord(GOOD);
  assert.ok(!isParseError(r));
  assert.equal(r.id, "T1");
  assert.equal(r.title, "Trim emails on login");
  assert.deepEqual(r.files, ["src/auth/login.ts", "test/auth/login.test.ts"]);
  assert.equal(r.steps.length, 3);
  assert.equal(r.run, "npm test -- test/auth/login.test.ts");
  assert.equal(r.expected, "1 test passes, 0 fail.");
  assert.equal(r.outOfScope, "password handling.");
});

test("a missing Run section is named in the error", () => {
  const r = parseTaskRecord(without("Run"));
  assert.ok(isParseError(r));
  assert.match(r.message, /missing section: Run/);
});

test("every missing section is reported at once", () => {
  const r = parseTaskRecord(without("Run").replace(/\*\*Expected:\*\*.*\n/, ""));
  assert.ok(isParseError(r));
  assert.match(r.message, /Run/);
  assert.match(r.message, /Expected/);
});

test("TBD anywhere is rejected", () => {
  const r = parseTaskRecord(GOOD.replace("password handling.", "TBD"));
  assert.ok(isParseError(r));
  assert.match(r.message, /TBD/);
});

test("Run and Expected must be concrete, not placeholders", () => {
  const run = parseTaskRecord(GOOD.replace(/\*\*Run:\*\*.*/, "**Run:** n/a"));
  assert.ok(isParseError(run));
  assert.match(run.message, /Run must be a concrete command/);
  const expected = parseTaskRecord(GOOD.replace(/\*\*Expected:\*\*.*/, "**Expected:** works"));
  assert.ok(isParseError(expected));
  assert.match(expected.message, /Expected/);
});

test("a task has 3 to 7 steps", () => {
  const two = parseTaskRecord(GOOD.replace("3. Run the suite.\n", ""));
  assert.ok(isParseError(two));
  assert.match(two.message, /3.7 steps/);
  const many = GOOD.replace("3. Run the suite.", "3. a\n4. b\n5. c\n6. d\n7. e\n8. f");
  assert.ok(isParseError(parseTaskRecord(many)));
});

test("the header must carry an id and a title", () => {
  const r = parseTaskRecord(GOOD.replace("## T1 — Trim emails on login", "# Trim emails"));
  assert.ok(isParseError(r));
  assert.match(r.message, /header/);
});

test("a section's text may continue over several lines", () => {
  const r = parseTaskRecord(GOOD.replace("**Goal:** Logging", "**Goal:** Logging in\nwith spaces"));
  assert.ok(!isParseError(r));
  assert.match(r.goal, /Logging in\nwith spaces/);
});
