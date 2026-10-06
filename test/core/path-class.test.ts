import assert from "node:assert/strict";
import test from "node:test";
import { classifyPath, type PathClass } from "../../src/core/path-class.ts";

const cases: ReadonlyArray<readonly [string, PathClass]> = [
  ["src/main.ts", "source"],
  ["src/lib.rs", "source"],
  ["scripts/build.sh", "source"],
  ["app/models/user.rb", "source"],
  ["test/a.test.ts", "test"],
  ["tests/it.rs", "test"],
  ["src/foo_test.go", "test"],
  ["README.md", "docs"],
  ["docs/plan/x.md", "docs"],
  ["docs/diagram.ts", "docs"],
  ["CHANGELOG", "docs"],
  ["LICENSE", "docs"],
  ["package.json", "config"],
  ["tsconfig.json", "config"],
  ["Cargo.toml", "config"],
  [".github/workflows/ci.yml", "config"],
  ["lefthook.yml", "config"],
  ["biome.json", "config"],
  ["Dockerfile", "config"],
  [".gitignore", "config"],
  ["Makefile", "config"],
  ["node_modules/x/index.js", "generated"],
  ["dist/index.js", "generated"],
  ["target/debug/build.rs", "generated"],
  ["package-lock.json", "generated"],
  ["Cargo.lock", "generated"],
  ["src/api.generated.ts", "generated"],
  ["src/__generated__/types.ts", "generated"],
  ["app.min.js", "generated"],
  ["pb/user.pb.go", "generated"],
  ["src/build/index.ts", "source"],
  ["src/vendor/x.ts", "source"],
  ["build/out.js", "generated"],
  ["vitest.config.ts", "config"],
  ["tools/eslint.config.js", "config"],
  ["../other/x.ts", "other"],
  ["/tmp/x.ts", "other"],
  ["src/tests.rs", "test"],
  ["src/foo/tests.rs", "test"],
  ["src/foo_tests.rs", "test"],
  ["assets/logo.png", "other"],
  ["notes.xyz", "other"],
];

for (const [path, expected] of cases) {
  test(`classifyPath(${path}) is ${expected}`, () => {
    assert.equal(classifyPath(path), expected);
  });
}

test("profile test globs make a path a test", () => {
  assert.equal(classifyPath("src/checks/a.ts", { testGlobs: ["src/checks/**"] }), "test");
});
