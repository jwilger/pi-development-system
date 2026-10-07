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

test("decideBump takes the highest level the evidence supports", async () => {
  const { decideBump } = await import("../scripts/lib/semver.ts");
  assert.deepEqual(decideBump({ breaking: 0.9, feature: 0.9, observable: 1 }), {
    bump: "major",
    confidence: 0.9,
  });
  assert.equal(decideBump({ breaking: 0.05, feature: 0.9, observable: 1 }).bump, "minor");
  assert.equal(decideBump({ breaking: 0.05, feature: 0.1, observable: 0.9 }).bump, "patch");
  assert.equal(decideBump({ breaking: 0.02, feature: 0.05, observable: 0.1 }).bump, "none");
});

test("decideBump confidence is the weakest link, so spread across levels does not hide a clear feature", async () => {
  const { decideBump } = await import("../scripts/lib/semver.ts");
  const r = decideBump({ breaking: 0.1, feature: 0.8, observable: 0.95 });
  assert.equal(r.bump, "minor");
  assert.ok(Math.abs(r.confidence - 0.8) < 1e-9);
  assert.ok(decideBump({ breaking: 0.45, feature: 0.8, observable: 1 }).confidence <= 0.55);
});

test("decideBump takes the highest supported level and reports the weakest link", async () => {
  const { decideBump } = await import("../scripts/lib/semver.ts");
  assert.deepEqual(decideBump({ breaking: 0.9, feature: 0.9, observable: 0.9 }), {
    bump: "major",
    confidence: 0.9,
  });
  const minor = decideBump({ breaking: 0.1, feature: 0.8, observable: 0.9 });
  assert.equal(minor.bump, "minor");
  assert.equal(minor.confidence, 0.8);
  const patch = decideBump({ breaking: 0.05, feature: 0.2, observable: 0.7 });
  assert.equal(patch.bump, "patch");
  assert.equal(patch.confidence, 0.7);
  const none = decideBump({ breaking: 0.05, feature: 0.1, observable: 0.2 });
  assert.equal(none.bump, "none");
  assert.equal(none.confidence, 0.8);
});

test("decideBump confidence drops when a link is uncertain", async () => {
  const { decideBump } = await import("../scripts/lib/semver.ts");
  assert.ok(decideBump({ breaking: 0.45, feature: 0.9, observable: 0.9 }).confidence <= 0.55);
});

test("decideBump below 1.0.0 folds breaking into the minor decision", async () => {
  const { decideBump } = await import("../scripts/lib/semver.ts");
  const j = decideBump({ breaking: 0.56, feature: 0.95, observable: 0.98 }, { preStable: true });
  assert.deepEqual(j, { bump: "minor", confidence: 0.95 });
  const k = decideBump({ breaking: 0.7, feature: 0.1, observable: 0.9 }, { preStable: true });
  assert.deepEqual(k, { bump: "minor", confidence: 0.7 });
});
