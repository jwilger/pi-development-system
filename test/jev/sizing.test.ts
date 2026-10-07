import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer, ClassifierQuestion } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  ARTIFACT_QUESTIONS,
  judgeSizing,
  SIZING_QUESTION,
} from "../../src/jev/questions/sizing.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

type Seen = { state: Record<string, unknown>; questions: string[] };
const choice = (label: string, confidence: number): ClassifierAnswer => ({
  type: "choice",
  choice: label,
  probabilities: {},
  confidence,
});
const bool = (probability: number): ClassifierAnswer => ({ type: "bool", probability });
const needs = (p: number): Record<string, ClassifierAnswer> =>
  Object.fromEntries(Object.keys(ARTIFACT_QUESTIONS).map((k) => [k, bool(p)]));
const jevWith = (answers: Record<string, ClassifierAnswer> | undefined, seen?: Seen[]): Jev => ({
  ask: async (state, questions: Record<string, ClassifierQuestion>) => {
    seen?.push({ state, questions: Object.keys(questions) });
    return answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers);
  },
  availability: () => "online",
  model: () => "fake/jev",
});

test("a confident sizing is returned with a need for every artifact", async () => {
  const seen: Seen[] = [];
  const r = await judgeSizing(jevWith({ sizing: choice("change", 0.8), ...needs(0.2) }, seen), {
    request: "add a --json flag",
    repoSummary: "typescript cli",
  });
  assert.equal(r.ok && r.value.sizing, "change");
  assert.equal(r.ok && r.value.confidence, 0.8);
  assert.equal(r.ok && r.value.artifactNeed["task-record"], 1);
  assert.equal(r.ok && r.value.artifactNeed["event-model"], 0.2);
  assert.equal(r.ok && r.value.artifactNeed["brief-lite"], r.ok && r.value.artifactNeed.brief);
  assert.ok(seen[0]?.questions.includes("sizing"));
});

test("sizing is ordinal: mass spread over neighbours lands on the weighted median", async () => {
  const spread: ClassifierAnswer = {
    type: "choice",
    choice: "product",
    probabilities: { fix: 0.05, change: 0.15, capability: 0.35, product: 0.45 },
    confidence: 0.45,
  };
  const r = await judgeSizing(jevWith({ sizing: spread, ...needs(0.5) }), {
    request: "r",
    repoSummary: "s",
  });
  assert.equal(r.ok && r.value.sizing, "capability");
});

test("the request and summary are redacted before Jev sees them", async () => {
  const seen: Seen[] = [];
  await judgeSizing(jevWith({ sizing: choice("fix", 1), ...needs(0) }, seen), {
    request: "use token ghp_abcdefghijklmnopqrstuvwxyz0123456789ab",
    repoSummary: "s",
  });
  assert.doesNotMatch(JSON.stringify(seen[0]?.state), /ghp_abcdef/);
});

test("unknown labels, missing or mistyped answers and Jev errors are errors", async () => {
  const input = { request: "r", repoSummary: "s" };
  assert.equal(
    (await judgeSizing(jevWith({ sizing: choice("epic", 1), ...needs(0) }), input)).ok,
    false,
  );
  assert.equal((await judgeSizing(jevWith({ ...needs(0) }), input)).ok, false);
  const mistyped = { sizing: choice("fix", 1), ...needs(0), "event-model": choice("x", 1) };
  assert.equal((await judgeSizing(jevWith(mistyped), input)).ok, false);
  assert.equal((await judgeSizing(jevWith(undefined), input)).ok, false);
});

test("question text matches the fixture's pinned hash", () => {
  const combined = [SIZING_QUESTION, ...Object.values(ARTIFACT_QUESTIONS)]
    .map(questionHash)
    .join("");
  assert.equal(loadFixture("sizing").questionHash, combined);
});
