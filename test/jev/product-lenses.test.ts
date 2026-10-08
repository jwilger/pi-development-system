import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  judgeProductLenses,
  PRODUCT_LENS_QUESTIONS,
} from "../../src/jev/questions/product-lenses.ts";
import { PRODUCT_LENSES } from "../../src/review/lens-review.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const jevWith = (answers: Record<string, ClassifierAnswer> | undefined): Jev => ({
  ask: async () => (answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers)),
  availability: () => "online",
  model: () => "fake/jev",
});
const all = (p: number): Record<string, ClassifierAnswer> =>
  Object.fromEntries(PRODUCT_LENSES.map((l) => [l, { type: "bool", probability: p }]));

test("one probability per product lens", async () => {
  const r = await judgeProductLenses(
    jevWith({ ...all(0.1), rumelt: { type: "bool", probability: 0.9 } }),
    {
      brief: "# Brief",
    },
  );
  assert.deepEqual(r, {
    ok: true,
    value: { cagan: 0.1, torres: 0.1, pichler: 0.1, perri: 0.1, rumelt: 0.9 },
  });
});

test("an error passes through and a missing or wrong-typed answer is refused", async () => {
  assert.equal((await judgeProductLenses(jevWith(undefined), { brief: "x" })).ok, false);
  const { torres: _gone, ...partial } = all(0.5);
  assert.equal((await judgeProductLenses(jevWith(partial), { brief: "x" })).ok, false);
  const wrong = {
    ...all(0.5),
    cagan: { type: "choice", choice: "a", probabilities: {}, confidence: 1 },
  };
  assert.equal((await judgeProductLenses(jevWith(wrong as never), { brief: "x" })).ok, false);
});

test("secrets are redacted and a long brief is clipped", async () => {
  let seen: Record<string, unknown> = {};
  const jev: Jev = {
    ask: async (state) => {
      seen = state;
      return ok(all(0));
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  await judgeProductLenses(jev, {
    brief: `Authorization: Bearer abcdef0123456789abcdef${"x".repeat(50_000)}`,
  });
  assert.equal(String(seen.brief).includes("abcdef0123456789abcdef"), false);
  assert.ok(String(seen.brief).length <= 8000);
});

test("the product-lens fixture is pinned to the current questions", () => {
  const hash = PRODUCT_LENSES.map((l) => questionHash({ ...PRODUCT_LENS_QUESTIONS[l] })).join("");
  assert.equal(loadFixture("product-lenses").questionHash, hash);
});
