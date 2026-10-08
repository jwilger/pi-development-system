import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import type { ClassifierQuestion } from "@earendil-works/pi-ai";
import { loadFixture, questionHash } from "./fixture-runner.ts";

// Non-negotiable 10: a Jev question ships with an evidence check. The per-question tests pin the
// hashes they know about; this one covers the gap a new or renamed question would fall through.

const QUESTIONS = new URL("../../src/jev/questions/", import.meta.url);
const FIXTURES = new URL("../../evals/jev/", import.meta.url);
const HASH_LENGTH = 16;

const isQuestion = (value: unknown): value is ClassifierQuestion =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  (value.type === "bool" || value.type === "choice" || value.type === "score");

/** Every question an exported value holds: the question itself, or a record/array of them. */
const questionsIn = (value: unknown): ClassifierQuestion[] => {
  if (isQuestion(value)) return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(questionsIn);
};

const files = readdirSync(QUESTIONS).filter((name) => name.endsWith(".ts"));

const chunks = (hash: string): string[] =>
  Array.from({ length: hash.length / HASH_LENGTH }, (_, i) =>
    hash.slice(i * HASH_LENGTH, (i + 1) * HASH_LENGTH),
  );

// A fixture's questionHash is the hashes of its questions joined, so it is read in 16-character chunks.
const fixtureNames = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -".json".length));
const pinned = new Set(fixtureNames.flatMap((name) => chunks(loadFixture(name).questionHash)));

const asked = new Map<string, ClassifierQuestion[]>();
for (const file of files) {
  const module: unknown = await import(new URL(file, QUESTIONS).href);
  asked.set(file, questionsIn(module));
}
const currentHashes = new Set([...asked.values()].flat().map(questionHash));

for (const [file, questions] of asked) {
  test(`${file}: asks at least one question, each pinned by a fixture`, () => {
    assert.ok(questions.length > 0, "no exported question found; is it exported and typed?");
    for (const question of questions) {
      assert.ok(
        pinned.has(questionHash(question)),
        `no evals/jev fixture pins this question; add cases and its hash: ${question.instructions.slice(0, 60)}`,
      );
    }
  });
}

for (const name of fixtureNames) {
  test(`evals/jev/${name}.json: every pinned question still exists`, () => {
    const { questionHash: hash, cases } = loadFixture(name);
    assert.equal(hash.length % HASH_LENGTH, 0, "the hash is a whole number of 16-character hashes");
    assert.ok(cases.length > 0, "a fixture with no cases pins nothing");
    for (const chunk of chunks(hash)) {
      assert.ok(
        currentHashes.has(chunk),
        `hash ${chunk} matches no current question; stale fixture`,
      );
    }
  });
}
