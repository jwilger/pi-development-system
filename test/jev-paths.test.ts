import assert from "node:assert/strict";
import test from "node:test";
import { JEV_FACING_PATHS, touchesJevFacing } from "../scripts/lib/jev-paths.ts";

test("changes under Jev code, fixtures or live tests need the live run", () => {
  for (const path of [
    "src/jev/questions/turn.ts",
    "src/jev/client.ts",
    "evals/jev/drift.json",
    "test/live/turn.live.ts",
    "test/jev/fixture-runner.ts",
    "src/core/redact.ts",
    "src/core/review.ts",
    "src/core/routing.ts",
    "src/core/git-intent.ts",
  ])
    assert.equal(touchesJevFacing([path]), true, path);
});

test("release classifier evidence, policy and callers require live regression checks", () => {
  for (const path of [
    "evals/release/bump.json",
    "scripts/lib/jev.ts",
    "scripts/check-version.ts",
    "scripts/lib/semver.ts",
    "scripts/lib/range.ts",
    "scripts/lib/config.ts",
    "scripts/lib/sh.ts",
    "test/jev/release-fixture.ts",
  ])
    assert.equal(touchesJevFacing([path]), true, path);
});

test("unrelated changes do not", () => {
  assert.equal(
    touchesJevFacing(["src/core/review-flow.ts", "README.md", "test/jev/turn.test.ts"]),
    false,
  );
  assert.equal(touchesJevFacing([]), false);
});

test("one Jev-facing path among many is enough", () => {
  assert.equal(touchesJevFacing(["README.md", "evals/jev/route.json"]), true);
});

test("the list names directories, so a sibling with the same prefix does not match", () => {
  assert.ok(JEV_FACING_PATHS.every((p) => p.endsWith("/") || p.includes(".")));
  assert.equal(touchesJevFacing(["src/jevx/a.ts"]), false);
});
