import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer, ClassifierQuestion } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  INTENT_QUESTION,
  INTENTS,
  judgeIntent,
  requestText,
} from "../../src/jev/questions/intent.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const choice = (label: string, confidence: number): ClassifierAnswer => ({
  type: "choice",
  choice: label,
  probabilities: {},
  confidence,
});
const jevWith = (
  answer: ClassifierAnswer | undefined,
  seen: Record<string, unknown>[] = [],
): Jev => ({
  ask: async (state, _questions: Record<string, ClassifierQuestion>) => {
    seen.push(state);
    return answer === undefined ? err({ kind: "provider", message: "x" }) : ok({ intent: answer });
  },
  availability: () => "online",
  model: () => "fake/jev",
});

test("the judged intent and its confidence are returned", async () => {
  const r = await judgeIntent(jevWith(choice("fix", 0.9)), {
    prompt: "login is broken",
    phase: "idle",
  });
  assert.deepEqual(r.ok && r.value, { intent: "fix", confidence: 0.9 });
});

test("an unknown label is a provider error, never a guess", async () => {
  const r = await judgeIntent(jevWith(choice("chitchat", 0.9)), { prompt: "hi", phase: "idle" });
  assert.equal(r.ok, false);
});

test("a failing Jev surfaces its error", async () => {
  const r = await judgeIntent(jevWith(undefined), { prompt: "hi", phase: "idle" });
  assert.equal(r.ok, false);
});

test("the prompt is redacted and clipped before it reaches Jev", async () => {
  const seen: Record<string, unknown>[] = [];
  const secret = ["gh", "p_", "a".repeat(36)].join("");
  await judgeIntent(jevWith(choice("question", 0.9), seen), {
    prompt: `${secret} ${"x".repeat(5000)}`,
    phase: "idle",
  });
  const sent = String(seen[0]?.prompt);
  assert.equal(sent.includes(secret), false);
  assert.ok(sent.length <= 1500);
});

test("every fixture label is a known intent, and the question hash is pinned", () => {
  const fixture = loadFixture("intent");
  assert.equal(fixture.questionHash, questionHash(INTENT_QUESTION));
  for (const c of fixture.cases) assert.ok((INTENTS as readonly string[]).includes(c.expected));
});

test("a /skill: prompt is judged on the request after the skill body, and long prompts keep both ends", () => {
  const body = "x".repeat(3000);
  assert.equal(
    requestText(`<skill name="tdd">${body}</skill>\n\nadd a --json flag`),
    "add a --json flag",
  );
  const long = `${"a".repeat(2000)} THE REQUEST`;
  const kept = requestText(long);
  assert.ok(kept.length <= 1500);
  assert.ok(kept.endsWith("THE REQUEST"));
  assert.ok(kept.startsWith("aaaa"));
});

test("a secret whose name falls in the clipped middle is redacted before the clip, not after", async () => {
  const secret = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
  const prompt = `${"a".repeat(740)}\nexport MY_SERVICE_TOKEN=${secret}\n${"b".repeat(1400)}`;
  let sent = "";
  const jev = {
    ask: (state: unknown) => {
      sent = JSON.stringify(state);
      return Promise.resolve({ ok: false as const, error: { kind: "no-model" as const } });
    },
    availability: () => "online" as const,
    model: () => undefined,
  };
  await judgeIntent(jev as never, { prompt, phase: "idle" });
  assert.equal(sent.includes(secret), false);
  assert.equal(sent.includes("MY_SERVICE_TOKEN=ghp"), false);
});
