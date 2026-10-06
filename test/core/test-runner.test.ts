import assert from "node:assert/strict";
import test from "node:test";
import { exitCodeOf, isTestRunnerCommand, summarizeOutput } from "../../src/core/test-runner.ts";

const yes = [
  "cargo test",
  "cargo test --all -- --nocapture",
  "cargo +nightly test",
  "cargo nextest run",
  "npm test",
  "npm run test",
  "npm run test:unit",
  "pnpm test",
  "yarn test",
  "bun test",
  "node --test test/a.test.ts",
  "node --test",
  "npx vitest run",
  "vitest",
  "npx jest --ci",
  "pytest -q",
  "python -m pytest",
  "go test ./...",
  "deno test",
  "cd app && npm test",
  "FOO=1 npm test",
  "time npm test",
  "timeout 60 cargo test",
  "npm test 2>&1 | tail -20",
  "npm run build && npm test",
];
const no = [
  "npm run build",
  "npm install",
  "cargo build",
  "cargo check",
  "echo npm test",
  "ls test",
  "git commit -m 'npm test'",
  "grep -r vitest .",
  "cat package.json",
  "node script.js",
  "npm run lint",
  "",
];

for (const c of yes) test(`runner: ${c}`, () => assert.equal(isTestRunnerCommand(c), true));
for (const c of no)
  test(`not a runner: ${JSON.stringify(c)}`, () => assert.equal(isTestRunnerCommand(c), false));

test("exit code comes from structured content first", () => {
  assert.equal(exitCodeOf({ isError: true, text: "", structured: { exit_code: 3 } }), 3);
});

test("exit code is parsed from pi's status line", () => {
  assert.equal(exitCodeOf({ isError: true, text: "boom\n\nCommand exited with code 101" }), 101);
});

test("an error without a code counts as a failure and success as 0", () => {
  assert.equal(exitCodeOf({ isError: true, text: "x" }), 1);
  assert.equal(exitCodeOf({ isError: false, text: "ok" }), 0);
});

test("summary is the last meaningful lines, bounded and redacted", () => {
  const out = `${"noise\n".repeat(50)}test result: FAILED. 1 passed; 2 failed\nTOKEN=abcdef123456789\n`;
  const s = summarizeOutput(out);
  assert.match(s, /2 failed/);
  assert.doesNotMatch(s, /abcdef123456789/);
  assert.ok(s.length <= 300);
});

test("an empty output summarises to an empty string", () => {
  assert.equal(summarizeOutput("  \n"), "");
});
