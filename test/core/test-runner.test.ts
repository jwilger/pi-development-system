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

test("a piped run that printed failures is recorded as failing even though the pipeline exited 0", () => {
  const text = "# pass 3\n# fail 2\n";
  assert.equal(exitCodeOf({ isError: false, text, command: "npm test 2>&1 | tail -30" }), 1);
  assert.equal(
    exitCodeOf({
      isError: false,
      text: "test result: FAILED. 1 failed",
      command: "cargo test || true",
    }),
    1,
  );
  assert.equal(exitCodeOf({ isError: false, text: "2 failed", command: "npm test; echo done" }), 1);
});

test("a piped run with no failure markers stays green and an unpiped zero exit is trusted", () => {
  assert.equal(
    exitCodeOf({ isError: false, text: "# pass 3\n# fail 0\n", command: "npm test | tail" }),
    0,
  );
  assert.equal(exitCodeOf({ isError: false, text: "# fail 2", command: "npm test" }), 0);
});

test("node's own failure summary counts as a failure marker when the status is masked", () => {
  const text = "ℹ pass 0\nℹ fail 1\n✖ failing tests:";
  assert.equal(exitCodeOf({ isError: false, text, command: "npm test 2>&1 | tail -20" }), 1);
});

test("compile-only and listing runs are not test runs", () => {
  assert.equal(isTestRunnerCommand("cargo test --no-run"), false);
  assert.equal(isTestRunnerCommand("cargo test"), true);
});

test("a structured exit_code of 0 from a piped run does not hide failure output", () => {
  const text = "ℹ fail 1\n✖ failing tests:";
  const structured = { exit_code: 0 };
  assert.equal(exitCodeOf({ isError: false, text, structured, command: "npm test | tail -5" }), 1);
  assert.equal(exitCodeOf({ isError: false, text, structured, command: "npm test" }), 0);
});

test("a newline-separated command masks the runner's status like a semicolon", () => {
  const text = "test result: FAILED. 0 passed; 1 failed";
  assert.equal(
    exitCodeOf({
      isError: false,
      text,
      structured: { exit_code: 0 },
      command: "cargo test\necho done",
    }),
    1,
  );
});

test("a multi-line private key is redacted even when only its tail would be kept", () => {
  const out = [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "AAAAC3NzaC1lZDI1NTE5AAAAIPHSECRETSECRETSECRET",
    "bGluZTJsaW5lMmxpbmUybGluZTJsaW5lMg==",
    "bGluZTNsaW5lM2xpbmUzbGluZTNsaW5lMw==",
    "bGluZTRsaW5lNGxpbmU0bGluZTRsaW5lNA==",
    "-----END OPENSSH PRIVATE KEY-----",
  ].join("\n");
  const s = summarizeOutput(out);
  assert.doesNotMatch(s, /SECRETSECRET|bGluZ/);
});
