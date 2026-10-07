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

const SECOND = GOOD.replace("## T1 — Trim emails on login", "## T2 — Lowercase emails").replace(
  /\*\*Run:\*\*.*\n/,
  "",
);

test("a plan file with other headings and several records parses the record named by id", () => {
  const plan = `# Plan\n\n## Goal and why\n\nText.\n\n${GOOD}\n${SECOND}`;
  const first = parseTaskRecord(plan, "T1");
  assert.ok(!isParseError(first));
  assert.equal(first.id, "T1");
  const second = parseTaskRecord(plan, "T2");
  assert.ok(isParseError(second));
  assert.match(second.message, /missing section: Run/);
});

test("several records without an id is an error naming them; an unknown id is an error", () => {
  const plan = `${GOOD}\n${SECOND}`;
  const many = parseTaskRecord(plan);
  assert.ok(isParseError(many));
  assert.match(many.message, /T1, T2/);
  const unknown = parseTaskRecord(plan, "T9");
  assert.ok(isParseError(unknown));
  assert.match(unknown.message, /T9/);
});

test("a later record's sections never fill in the first record's gaps", () => {
  const withRun = GOOD.replace("## T1 — Trim emails on login", "## T2 — Has a run");
  const r = parseTaskRecord(`${without("Run")}\n${withRun}`, "T1");
  assert.ok(isParseError(r));
  assert.match(r.message, /missing section: Run/);
});

test("a section given twice is an error", () => {
  const r = parseTaskRecord(
    GOOD.replace("**Out of scope:**", "**Run:** `npm run other`\n**Out of scope:**"),
  );
  assert.ok(isParseError(r));
  assert.match(r.message, /duplicate section: Run/);
});

test("the colon may sit outside the bold", () => {
  const r = parseTaskRecord(GOOD.replace("**Goal:**", "**Goal**:"));
  assert.ok(!isParseError(r));
  assert.match(r.goal, /trailing space/);
});

test("an empty or TODO command is not concrete", () => {
  for (const run of ["``", "`TODO: decide`", "TBD later"]) {
    const r = parseTaskRecord(GOOD.replace(/\*\*Run:\*\*.*\n/, `**Run:** ${run}\n`));
    assert.ok(isParseError(r), run);
    assert.match(r.message, /Run must be a concrete command/);
  }
});

test("a record saved with CRLF line endings parses like one with LF", () => {
  const r = parseTaskRecord(GOOD.replace(/\n/g, "\r\n"));
  assert.ok(!isParseError(r));
  assert.equal(r.id, "T1");
  assert.equal(r.run, "npm test -- test/auth/login.test.ts");
});

test("a command or result that merely starts with the word todo is concrete", () => {
  const r = parseTaskRecord(
    GOOD.replace(/\*\*Run:\*\*.*\n/, "**Run:** `todo-cli list --all`\n").replace(
      /\*\*Expected:\*\*.*\n/,
      "**Expected:** todo list shows 3 items.\n",
    ),
  );
  assert.ok(!isParseError(r));
});

test("indented sub-bullets belong to their step and do not count as steps", () => {
  const one = parseTaskRecord(
    GOOD.replace(
      /\*\*Steps:\*\*[\s\S]*?\*\*Run:\*\*/,
      "**Steps:**\n1. Do everything.\n   - part a\n   - part b\n**Run:**",
    ),
  );
  assert.ok(isParseError(one));
  assert.match(one.message, /3.7 steps/);
  const nested = GOOD.replace(
    "3. Run the suite.",
    "3. Run the suite.\n   - first\n   - second\n   - third",
  );
  const r = parseTaskRecord(nested);
  assert.ok(!isParseError(r));
  assert.equal(r.steps.length, 3);
});

test("a later heading of any level ends the record, so following prose cannot leak into it", () => {
  const plan = `${GOOD}\n### I2 — Next increment\n\nTBD later.\n\n# Appendix\n\nMore.\n`;
  const r = parseTaskRecord(plan);
  assert.ok(!isParseError(r));
  assert.equal(r.outOfScope, "password handling.");
});

test("fenced content is not structure: headings, sections and list items inside a fence", () => {
  const fenced = GOOD.replace(
    "**Interfaces:**",
    "**Interfaces:**\n```md\n## Foo — bar\n**Goal:** other\n1. x\n2. y\n3. z\n4. w\n```\n",
  );
  const r = parseTaskRecord(fenced);
  assert.ok(!isParseError(r));
  assert.equal(r.id, "T1");
  assert.equal(r.steps.length, 3);
});

test("a Run written as a fenced block is the command inside, without the info string", () => {
  const r = parseTaskRecord(GOOD.replace(/\*\*Run:\*\*.*\n/, "**Run:**\n```sh\nnpm test\n```\n"));
  assert.ok(!isParseError(r));
  assert.equal(r.run, "npm test");
});

test("fences close only on a matching fence: a longer fence can hold shorter ones, ~~~ can hold backticks", () => {
  const nested = GOOD.replace(
    "**Interfaces:**",
    "**Interfaces:**\n````md\n```\n**Goal:** inner\n```\n````\n~~~\n```\n**Run:** inner\n~~~\n",
  );
  const r = parseTaskRecord(nested);
  assert.ok(!isParseError(r));
  assert.equal(r.run, "npm test -- test/auth/login.test.ts");
  assert.match(r.goal, /trailing space/);
});

test("an id that appears twice in a plan is ambiguous even when named", () => {
  const plan = `${GOOD}\n${GOOD}`;
  const r = parseTaskRecord(plan, "T1");
  assert.ok(isParseError(r));
  assert.match(r.message, /appears 2 times/);
});

test("text that is more than one code span is kept whole; a lone span is unwrapped; bullets are dropped from Files", () => {
  const r = parseTaskRecord(
    GOOD.replace(/\*\*Run:\*\*.*\n/, "**Run:** `npm test` from repo root\n").replace(
      /\*\*Files:\*\*.*\n/,
      "**Files:**\n- `src/a.ts` (new)\n- `test/a.test.ts`\n",
    ),
  );
  assert.ok(!isParseError(r));
  assert.equal(r.run, "`npm test` from repo root");
  assert.deepEqual(r.files, ["`src/a.ts` (new)", "test/a.test.ts"]);
  const two = parseTaskRecord(
    GOOD.replace(/\*\*Run:\*\*.*\n/, "**Run:** `cd web` then `npm test`\n"),
  );
  assert.ok(!isParseError(two));
  assert.equal(two.run, "`cd web` then `npm test`");
  const spans = parseTaskRecord(
    GOOD.replace(/\*\*Expected:\*\*.*\n/, "**Expected:** `3` tests pass\n"),
  );
  assert.ok(!isParseError(spans));
  const lead = parseTaskRecord(
    GOOD.replace(
      /\*\*Expected:\*\*.*\n/,
      "**Expected:** `OK` is printed and the exit status is 0\n",
    ),
  );
  assert.ok(!isParseError(lead));
});

test("list items indented up to three spaces, and plus bullets, are steps; the first item counts too", () => {
  for (const marker of [" 1.", "  1)", "   -", "+"]) {
    const steps = `**Steps:**\n${marker} a\n${marker.replace("1", "2")} b\n${marker.replace("1", "3")} c`;
    const r = parseTaskRecord(
      GOOD.replace(/\*\*Steps:\*\*[\s\S]*?\*\*Run:\*\*/, `${steps}\n**Run:**`),
    );
    assert.ok(!isParseError(r), marker);
    assert.equal(r.steps.length, 3, marker);
  }
});

test("TBD in the header title is a problem like TBD anywhere else", () => {
  const r = parseTaskRecord(GOOD.replace("Trim emails on login", "TBD later"));
  assert.ok(isParseError(r));
  assert.match(r.message, /contains TBD/);
});

test("a header whose title is only spaces is not a header", () => {
  const r = parseTaskRecord(GOOD.replace(/^## T1 — .*$/m, "## T1 —   "));
  assert.ok(isParseError(r));
});
