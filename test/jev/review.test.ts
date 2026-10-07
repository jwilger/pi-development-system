import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import { LENSES, selectLenses } from "../../src/core/review.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  judgeLenses,
  judgeSeverity,
  LENS_QUESTIONS,
  SEVERITY_QUESTION,
} from "../../src/jev/questions/review.ts";
import { fixturesEnabled, loadFixture, questionHash, realJev } from "./fixture-runner.ts";

const jevWith = (answers: Record<string, ClassifierAnswer> | undefined, seen?: unknown[]): Jev => ({
  ask: async (state) => {
    seen?.push(state);
    return answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers);
  },
  availability: () => "online",
  model: () => "fake/jev",
});
const input = { diffStat: "a.ts | 1 +", diffSample: "+x", profiles: ["typescript"] };
const allLenses = (p: number): Record<string, ClassifierAnswer> =>
  Object.fromEntries(LENSES.map((l) => [l, { type: "bool", probability: p } as ClassifierAnswer]));

test("judgeLenses returns one probability per lens", async () => {
  const answers = {
    ...allLenses(0.1),
    security: { type: "bool", probability: 0.9 } as ClassifierAnswer,
  };
  const r = await judgeLenses(jevWith(answers), input);
  assert.ok(r.ok);
  assert.equal(r.value.security, 0.9);
  assert.deepEqual(selectLenses(r.value), ["security"]);
});

test("a lens applies at 0.5 and above", () => {
  const p = Object.fromEntries(LENSES.map((l) => [l, 0.49])) as Record<
    (typeof LENSES)[number],
    number
  >;
  assert.deepEqual(selectLenses(p), []);
  assert.deepEqual(selectLenses({ ...p, ux: 0.5 }), ["ux"]);
});

test("a missing or malformed lens answer is a provider error", async () => {
  const partial = allLenses(0.5);
  delete partial.ux;
  assert.equal((await judgeLenses(jevWith(partial), input)).ok, false);
  const nan = {
    ...allLenses(0.5),
    ux: { type: "bool", probability: Number.NaN } as ClassifierAnswer,
  };
  assert.equal((await judgeLenses(jevWith(nan), input)).ok, false);
  assert.equal((await judgeLenses(jevWith(undefined), input)).ok, false);
});

test("lens and severity input is redacted and clipped before it reaches Jev", async () => {
  const seen: Array<Record<string, unknown>> = [];
  await judgeLenses(jevWith(allLenses(0), seen), {
    diffStat: "s",
    diffSample: `token ghp_${"a".repeat(36)} ${"x".repeat(30000)}`,
    profiles: [],
  });
  assert.ok(!String(seen[0]?.diffSample).includes("ghp_"));
  assert.ok(String(seen[0]?.diffSample).length <= 8000);
  await judgeSeverity(
    jevWith(
      { severity: { type: "choice", choice: "nit", probabilities: {}, confidence: 1 } },
      seen,
    ),
    { finding: `f ghp_${"b".repeat(36)}`, diffContext: "c".repeat(30000) },
  );
  assert.ok(!String(seen[1]?.finding).includes("ghp_"));
  assert.ok(String(seen[1]?.diffContext).length <= 6000);
});

test("judgeSeverity returns label and confidence; unknown labels and wrong kinds error", async () => {
  const good = jevWith({
    severity: { type: "choice", choice: "should-fix", probabilities: {}, confidence: 0.7 },
  });
  assert.deepEqual(await judgeSeverity(good, { finding: "f", diffContext: "c" }), {
    ok: true,
    value: { severity: "should-fix", confidence: 0.7 },
  });
  const bad = jevWith({
    severity: { type: "choice", choice: "catastrophic", probabilities: {}, confidence: 1 },
  });
  assert.equal((await judgeSeverity(bad, { finding: "f", diffContext: "c" })).ok, false);
  const wrong = jevWith({ severity: { type: "bool", probability: 1 } });
  assert.equal((await judgeSeverity(wrong, { finding: "f", diffContext: "c" })).ok, false);
  assert.equal(
    (await judgeSeverity(jevWith(undefined), { finding: "f", diffContext: "c" })).ok,
    false,
  );
});

const lensHash = () => LENSES.map((l) => questionHash({ ...LENS_QUESTIONS[l] })).join("");

test("review fixtures pin the current question text", { skip: !fixturesEnabled() }, () => {
  assert.equal(loadFixture("review-lenses").questionHash, lensHash());
  assert.equal(
    loadFixture("finding-severity").questionHash,
    questionHash({ ...SEVERITY_QUESTION }),
  );
});

test("lens fixture: per-lens accuracy ≥ 0.85 with a real Jev", {
  skip: !fixturesEnabled(),
}, async () => {
  const jev = await realJev();
  let right = 0;
  let total = 0;
  for (const c of loadFixture("review-lenses").cases) {
    const r = await judgeLenses(jev, {
      diffStat: c.state.diffStat ?? "",
      diffSample: c.state.diffSample ?? "",
      profiles: [c.state.profiles ?? ""],
    });
    const expected = new Set(c.expected.split(",").filter(Boolean));
    for (const lens of LENSES) {
      total++;
      const picked = r.ok && selectLenses(r.value).includes(lens);
      if (picked === expected.has(lens)) right++;
      else
        console.log(
          "  miss:",
          lens,
          picked ? "picked" : "skipped",
          "for",
          c.state.diffStat?.split("\n")[0],
        );
    }
  }
  assert.ok(right / total >= 0.85, `${right}/${total}`);
});

test("severity fixture reaches 0.8 with a real Jev", { skip: !fixturesEnabled() }, async () => {
  const jev = await realJev();
  const fixture = loadFixture("finding-severity");
  let passed = 0;
  for (const c of fixture.cases) {
    const r = await judgeSeverity(jev, {
      finding: c.state.finding ?? "",
      diffContext: c.state.diffContext ?? "",
    });
    if (r.ok && r.value.severity === c.expected) passed++;
    else
      console.log(
        "  miss:",
        c.state.finding?.slice(0, 50),
        "→",
        r.ok ? r.value.severity : "error",
        "expected",
        c.expected,
      );
  }
  assert.ok(passed / fixture.cases.length >= 0.8, `${passed}/${fixture.cases.length}`);
});
