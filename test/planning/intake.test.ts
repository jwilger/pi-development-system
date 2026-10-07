import assert from "node:assert/strict";
import test from "node:test";
import type { ArtifactId } from "../../src/core/sizing.ts";
import { ARTIFACTS } from "../../src/core/sizing.ts";
import {
  phaseFor,
  proposeArtifacts,
  renderProposal,
  sliceSlug,
} from "../../src/planning/intake.ts";

const need = (over: Partial<Record<ArtifactId, number>> = {}): Record<ArtifactId, number> =>
  Object.fromEntries(ARTIFACTS.map((id) => [id, over[id] ?? 0])) as Record<ArtifactId, number>;

test("a slice slug is lowercase kebab-case and bounded", () => {
  assert.equal(sliceSlug("Add a --json flag to the CLI!"), "add-a-json-flag-to-the-cli");
  assert.equal(sliceSlug("   "), "work");
  assert.ok(sliceSlug("x".repeat(200)).length <= 40);
  assert.doesNotMatch(
    sliceSlug("trailing words that get cut off right on a dash boundary ok"),
    /-$/,
  );
});

test("the table's artifacts are recommended; high-need extras are offered, never forced", () => {
  const p = proposeArtifacts(
    "change",
    need({ "event-model": 0.8, journeys: 0.2, "brief-lite": 0.9 }),
  );
  assert.deepEqual(p.recommended, ["task-record", "review", "adr-if-needed"]);
  assert.deepEqual(p.consider, ["brief-lite", "event-model"]);
});

test("small work needs no brief variants or lens review in its consider list unless Jev asks", () => {
  assert.deepEqual(proposeArtifacts("fix", need()).consider, []);
});

test("fix and change go straight to implementing; capability and product plan first", () => {
  assert.equal(phaseFor("fix"), "implementing");
  assert.equal(phaseFor("change"), "implementing");
  assert.equal(phaseFor("capability"), "planning");
  assert.equal(phaseFor("product"), "planning");
});

test("the proposal names the size, the artifacts, the departure rule and that event model is never blocked", () => {
  const text = renderProposal({
    sizing: "capability",
    basis: "Jev judged capability (0.82).",
    proposal: proposeArtifacts("capability", need({ architecture: 0.7 })),
  });
  assert.match(text, /capability/);
  assert.match(text, /event-model/);
  assert.match(text, /consider: architecture/i);
  assert.match(text, /artifact\.skipped:<artifact>/);
  assert.match(text, /never blocked/i);
});

test("a family of light and full artifacts is offered once, and not at all when one is recommended", () => {
  const high = need({
    "brief-lite": 0.9,
    brief: 0.9,
    "decision-register": 0.9,
    "lens-review-optional": 0.8,
    "lens-review": 0.8,
  });
  assert.deepEqual(proposeArtifacts("product", high).consider, []);
  assert.deepEqual(proposeArtifacts("change", high).consider, [
    "brief-lite",
    "lens-review-optional",
  ]);
  assert.deepEqual(proposeArtifacts("change", need({ brief: 0.9 })).consider, ["brief"]);
});
