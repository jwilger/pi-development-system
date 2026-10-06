import assert from "node:assert/strict";
import { test } from "node:test";
import { actualBump, satisfiesBump, parseVersion as v } from "../scripts/lib/semver.ts";

test("parseVersion rejects non-plain versions", () => {
  assert.throws(() => v("1.2"));
  assert.throws(() => v("1.2.3-beta.1"));
});

test("actualBump", () => {
  assert.equal(actualBump(v("1.2.3"), v("1.2.3")), "none");
  assert.equal(actualBump(v("1.2.3"), v("1.2.4")), "patch");
  assert.equal(actualBump(v("1.2.3"), v("1.3.0")), "minor");
  assert.equal(actualBump(v("1.2.3"), v("2.0.0")), "major");
  assert.equal(actualBump(v("1.2.3"), v("1.2.2")), "downgrade");
});

test("satisfiesBump", () => {
  assert.ok(satisfiesBump(v("1.2.3"), v("1.3.0"), "patch"));
  assert.ok(!satisfiesBump(v("1.2.3"), v("1.2.4"), "minor"));
  assert.ok(satisfiesBump(v("1.2.3"), v("1.2.3"), "none"));
  assert.ok(!satisfiesBump(v("1.2.3"), v("1.2.2"), "none"));
});

test("below 1.0.0 a major requirement is satisfied by a minor bump", () => {
  assert.ok(satisfiesBump(v("0.1.0"), v("0.2.0"), "major"));
  assert.ok(!satisfiesBump(v("0.1.0"), v("0.1.1"), "major"));
  assert.ok(!satisfiesBump(v("1.1.0"), v("1.2.0"), "major"));
});
