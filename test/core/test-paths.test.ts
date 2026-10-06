import assert from "node:assert/strict";
import test from "node:test";
import { isTestPath } from "../../src/core/test-paths.ts";

const yes = [
  "test/a.test.ts",
  "src/foo.spec.js",
  "tests/x.py",
  "src/__tests__/a.ts",
  "pkg/foo_test.go",
  "tests/it.rs",
  "src/test_util.py",
  "app/models/user_test.rb",
  "spec/user_spec.rb",
  "src/Foo.test.tsx",
  "e2e/login.cy.ts",
  "./test/deep/x.ts",
];
const no = [
  "src/main.ts",
  "README.md",
  "src/contest.ts",
  "src/latest/a.ts",
  "docs/testing.md",
  "package.json",
  "src/attest.ts",
];

for (const p of yes) test(`isTestPath ${p}`, () => assert.equal(isTestPath(p), true));
for (const p of no) test(`not a test path ${p}`, () => assert.equal(isTestPath(p), false));

test("a profile can add extra test globs", () => {
  assert.equal(isTestPath("checks/a.chk", { testGlobs: ["checks/**"] }), true);
});
