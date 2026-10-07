import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewPacket } from "../../src/core/review-packet.ts";
import { isParseError } from "../../src/core/types.ts";

const packet = `## Review — I6.1 — round 2 — lenses: types, tests
### Sources inspected
- src/core/review.ts:1-80
### Findings
- [blocking] types \`src/core/review.ts:42\` — streak ignores false-positive — a reviewer retraction would reset it
- [nit] tests — name is vague — readability
### Verdict
blocking
`;

test("a well-formed packet parses into findings with path and line", () => {
  const p = parseReviewPacket(packet);
  assert.ok(!isParseError(p));
  assert.equal(p.slice, "I6.1");
  assert.equal(p.round, 2);
  assert.deepEqual(p.lenses, ["types", "tests"]);
  assert.deepEqual(p.sources, ["src/core/review.ts:1-80"]);
  assert.equal(p.verdict, "blocking");
  assert.equal(p.findings.length, 2);
  assert.deepEqual(p.findings[0], {
    id: "types-1",
    severity: "blocking",
    path: "src/core/review.ts",
    line: 42,
    summary: "streak ignores false-positive — a reviewer retraction would reset it",
    lens: "types",
  });
  assert.equal(p.findings[1]?.path, undefined);
  assert.equal(p.findings[1]?.severity, "nit");
});

test("an empty findings section (or 'none') with verdict no-blocking is a clean packet", () => {
  for (const body of [
    "",
    "- none\n",
    "None.\n",
    "No findings.\n",
    "- No findings.\n",
    "(none)\n",
  ]) {
    const p = parseReviewPacket(
      `## Review — S — round 1 — lenses: types\n### Sources inspected\n- a.ts\n### Findings\n${body}### Verdict\nno-blocking\n`,
    );
    assert.ok(!isParseError(p), body);
    assert.equal(p.findings.length, 0);
  }
});

test("hyphen separators and a path without a line are accepted", () => {
  const p = parseReviewPacket(
    "## Review - S - round 1 - lenses: security\n### Findings\n- [should-fix] security `a/b.ts` - leaks a token - exposure\n### Verdict\nblocking\n",
  );
  assert.ok(!isParseError(p));
  assert.equal(p.findings[0]?.path, "a/b.ts");
  assert.equal(p.findings[0]?.line, undefined);
});

test("malformed packets are parse errors that say what is wrong", () => {
  const cases: Array<[string, RegExp]> = [
    ["no header here", /header/],
    ["## Review — S — round x — lenses: a\n### Verdict\nblocking", /round/],
    [
      "## Review — S — round 1 — lenses: a\n### Findings\n- [critical] a — x — y\n### Verdict\nblocking",
      /severity/,
    ],
    [
      "## Review — S — round 1 — lenses: a\n### Findings\n- something loose\n### Verdict\nblocking",
      /finding/,
    ],
    ["## Review — S — round 1 — lenses: a\n### Findings\n", /verdict/i],
    ["## Review — S — round 1 — lenses: a\n### Findings\n### Verdict\nmaybe", /verdict/i],
  ];
  for (const [text, re] of cases) {
    const p = parseReviewPacket(text);
    assert.ok(isParseError(p), text);
    assert.match(p.message, re, text);
  }
});

test("a verdict that contradicts the findings is rejected", () => {
  const p = parseReviewPacket(
    "## Review — S — round 1 — lenses: a\n### Findings\n- [blocking] a — x — y\n### Verdict\nno-blocking\n",
  );
  assert.ok(isParseError(p));
  assert.match(p.message, /contradict/);
  const q = parseReviewPacket(
    "## Review — S — round 1 — lenses: a\n### Findings\n- [nit] a — x — y\n### Verdict\nblocking\n",
  );
  assert.ok(isParseError(q));
});

test("real reviewer shapes parse: text after the location, a second location, indented trigger and fix lines", () => {
  const p = parseReviewPacket(
    [
      "## Review — s1 — round 1 — lenses: types",
      "### Sources inspected",
      "- a.ts:1-9",
      "### Findings",
      "- [should-fix] correctness `a.ts:125` (`fn`) — drops the error — hides a failure",
      "  - Trigger: input x",
      "  - Fix: return the error",
      "- [nit] types `a.ts:1` and `b.ts:2` — naming",
      "### Verdict",
      "blocking",
    ].join("\n"),
  );
  assert.ok(!isParseError(p));
  assert.equal(p.findings.length, 2);
  assert.equal(p.findings[0]?.path, "a.ts");
  assert.equal(p.findings[0]?.line, 125);
  assert.equal(p.findings[1]?.line, 1);
});

test("an indented line that is itself a finding is still counted", () => {
  const p = parseReviewPacket(
    "## Review — s1 — round 1 — lenses: types\n### Findings\n  - [blocking] types `a.ts:1` — x\n### Verdict\nblocking\n",
  );
  assert.ok(!isParseError(p));
  assert.equal(p.findings.length, 1);
});
