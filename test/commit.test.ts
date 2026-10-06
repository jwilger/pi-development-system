import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMessage, isBuildFix, overrideReason, revertedShas } from "../scripts/lib/commit.ts";

test("isBuildFix", () => {
  assert.ok(isBuildFix("fix(ci): repair lint"));
  assert.ok(isBuildFix('Revert "feat: x"\n\nThis reverts commit abc1234.'));
  assert.ok(!isBuildFix("fix: something"));
  assert.ok(!isBuildFix("fix(ci):no space"));
  assert.ok(!isBuildFix("feat: fix(ci): sneaky"));
});

test("overrideReason", () => {
  assert.equal(overrideReason("fix(ci): x\n\nJev-Override: Jev is down"), "Jev is down");
  assert.equal(overrideReason("fix(ci): x"), null);
  assert.equal(overrideReason("Jev-Override:   "), null);
});

test("revertedShas", () => {
  assert.deepEqual(revertedShas("This reverts commit ABCDEF1234."), ["abcdef1234"]);
  assert.deepEqual(revertedShas("nothing"), []);
});

test("cleanMessage drops comment lines", () => {
  assert.equal(cleanMessage("fix(ci): x\n# comment\n\nbody\n"), "fix(ci): x\n\nbody");
});
