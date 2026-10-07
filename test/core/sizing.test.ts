import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTIFACTS,
  type ArtifactId,
  parseSizing,
  recommendedArtifacts,
} from "../../src/core/sizing.ts";

const ids = (list: readonly ArtifactId[]): string[] => [...list].sort();

test("a fix needs only a task record", () => {
  assert.deepEqual(recommendedArtifacts("fix"), ["task-record"]);
});

test("a change adds review and a decision record when needed", () => {
  assert.deepEqual(ids(recommendedArtifacts("change")), ["adr-if-needed", "review", "task-record"]);
});

test("a capability adds a light brief, journeys, an event model and optional lens review", () => {
  assert.deepEqual(ids(recommendedArtifacts("capability")), [
    "adr-if-needed",
    "brief-lite",
    "event-model",
    "journeys",
    "lens-review-optional",
    "review",
    "task-record",
  ]);
});

test("a product gets the full set with a real brief and mandatory lens review", () => {
  assert.deepEqual(ids(recommendedArtifacts("product")), [
    "adr-if-needed",
    "architecture",
    "brief",
    "decision-register",
    "event-model",
    "journeys",
    "lens-review",
    "review",
    "task-record",
  ]);
});

test("each larger size contains everything the smaller one asks for, except the lighter forms", () => {
  const light = new Set<ArtifactId>(["brief-lite", "lens-review-optional"]);
  const sizes = ["fix", "change", "capability", "product"] as const;
  for (let i = 1; i < sizes.length; i++) {
    const smaller = recommendedArtifacts(sizes[i - 1] as (typeof sizes)[number]);
    const larger = new Set(recommendedArtifacts(sizes[i] as (typeof sizes)[number]));
    for (const id of smaller)
      if (!light.has(id)) assert.ok(larger.has(id), `${sizes[i]} lacks ${id}`);
  }
});

test("every recommended artifact is a known artifact", () => {
  for (const size of ["fix", "change", "capability", "product"] as const)
    for (const id of recommendedArtifacts(size)) assert.ok(ARTIFACTS.includes(id));
});

test("parseSizing accepts the four sizes and rejects anything else", () => {
  assert.equal(parseSizing("capability"), "capability");
  assert.deepEqual(parseSizing("epic"), {
    kind: "parse-error",
    message: 'unknown sizing "epic": expected fix, change, capability or product',
  });
});
