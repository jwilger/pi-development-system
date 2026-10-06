import assert from "node:assert/strict";
import test from "node:test";
import { isTestPath, normalizeRepoPath } from "../../src/core/test-paths.ts";

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
  "tests",
  "test/",
  "tests/*",
  "test",
  "tests",
  "src/__tests__",
];
const no = [
  "test/*.log",
  "tests/fixtures/*.json",
  "test/__snapshots__/*.snap",
  "src/spec/parser.ts",
  "tests/__pycache__/a.pyc",
  "test/out.log",
  "spec/design.md",
  "tests/fixtures/data.json",
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

test("normalizeRepoPath resolves @, ~, file:// and absolute forms the way pi does", () => {
  const cwd = "/work/repo";
  const home = "/home/me";
  assert.equal(normalizeRepoPath(cwd, "@test/a.test.ts", home), "test/a.test.ts");
  assert.equal(normalizeRepoPath(cwd, "./test/a.test.ts", home), "test/a.test.ts");
  assert.equal(normalizeRepoPath(cwd, "/work/repo/test/a.test.ts", home), "test/a.test.ts");
  assert.equal(normalizeRepoPath(cwd, "file:///work/repo/test/a.test.ts", home), "test/a.test.ts");
  assert.equal(normalizeRepoPath(cwd, "~/x/a.test.ts", home), "../../home/me/x/a.test.ts");
  assert.equal(normalizeRepoPath(cwd, "test/../test/a.test.ts", home), "test/a.test.ts");
  assert.equal(normalizeRepoPath("/home/me/repo", "~/repo/test/a.test.ts", home), "test/a.test.ts");
});

test("profile globs: * stays in a segment, ** crosses directories", () => {
  assert.equal(isTestPath("checks/a.chk", { testGlobs: ["checks/*.chk"] }), true);
  assert.equal(isTestPath("checks/deep/a.chk", { testGlobs: ["checks/*.chk"] }), false);
  assert.equal(isTestPath("checks/deep/a.chk", { testGlobs: ["checks/**/*.chk"] }), true);
  assert.equal(isTestPath("checks/a.chk", { testGlobs: ["checks/**/*.chk"] }), false);
});
