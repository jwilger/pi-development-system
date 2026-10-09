import assert from "node:assert/strict";
import test from "node:test";
import { missingArtifacts } from "../../src/planning/missing-artifacts.ts";

const none = { exists: () => false, departedGates: [] };

test("fix and change work need no planning document", () => {
  assert.deepEqual(missingArtifacts("fix", none), []);
  assert.deepEqual(missingArtifacts("change", none), []);
});

test("capability work names the brief, journeys and event model, not the optional lens review", () => {
  assert.deepEqual(missingArtifacts("capability", none), ["brief-lite", "journeys", "event-model"]);
});

test("product work names every planning document in planning order", () => {
  assert.deepEqual(missingArtifacts("product", none), [
    "brief",
    "decision-register",
    "journeys",
    "event-model",
    "architecture",
    "lens-review",
  ]);
});

test("a file in the artifact's place, or a recorded skip, accounts for it", () => {
  const found = missingArtifacts("product", {
    exists: (p) => p === "docs/product/brief.md" || p === "ARCHITECTURE.md",
    departedGates: ["artifact.skipped:journeys", "artifact.skipped:lens-review"],
  });
  assert.deepEqual(found, ["decision-register", "event-model"]);
});

test("a skip of another artifact does not account for this one", () => {
  const found = missingArtifacts("capability", {
    exists: () => true,
    departedGates: ["artifact.skipped:brief"],
  });
  assert.deepEqual(found, []);
});
