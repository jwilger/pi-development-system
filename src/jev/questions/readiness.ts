import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { TaskRecord } from "../../planning/task-record.ts";
import type { Jev, JevError } from "../client.ts";

const vague = (instructions: string): ClassifierBoolQuestion => ({
  type: "bool",
  instructions,
  criteria: {
    true: "A weaker model implementing this alone would have to guess",
    false: "It is specific enough to act on without guessing",
  },
});

/** One narrow judgement per aspect; `tooBig` is separate because the fix is to split, not to add detail. */
export const READINESS_QUESTIONS = {
  goal: vague(
    "`task.goal` should be one observable sentence: something a person or test could see change. Is it vague, a restatement of the title, or about activity rather than outcome?",
  ),
  interfaces: vague(
    "`task.interfaces` should give exact signatures or contracts for what is created or changed. Is it missing signatures, hand-wavy ('a helper', 'some function') or inconsistent with `task.files`?",
  ),
  firstFailingTest: vague(
    "`task.firstFailingTest` should name a test file and test and say what it asserts. Does it fail to say what would be asserted, or assert something unrelated to `task.goal`?",
  ),
  steps: vague(
    "`task.steps` should be small steps a reviewer could reject independently. Are any steps large, combined ('implement and wire everything'), or out of order with the test-first step?",
  ),
  tooBig: {
    type: "bool",
    instructions:
      "Is this more than one task: does it touch unrelated areas, or need more than one failing test to describe, so that it should be split before anyone implements it?",
    criteria: {
      true: "It should be split into two or more task records",
      false: "It is one coherent task a single implementer can finish",
    },
  },
} as const satisfies Record<string, ClassifierBoolQuestion>;

type Readiness = "ready" | "needs-detail" | "too-big";
export type ReadinessJudgement = { readiness: Readiness; missing: string[] };

/** Probability at or above which an aspect counts as vague. */
const VAGUE_AT = 0.6;

const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

export async function judgeTaskReadiness(
  jev: Jev,
  record: TaskRecord,
): Promise<Result<ReadinessJudgement, JevError>> {
  const asked = await jev.ask(
    {
      task: {
        title: clip(record.title, 200),
        goal: clip(record.goal, 600),
        files: record.files.slice(0, 30).map((f) => clip(f, 200)),
        interfaces: clip(record.interfaces, 1500),
        firstFailingTest: clip(record.firstFailingTest, 600),
        steps: record.steps.slice(0, 10).map((s) => clip(s, 300)),
      },
    },
    READINESS_QUESTIONS,
  );
  if (!asked.ok) return asked;
  const probability = new Map<string, number>();
  for (const key of Object.keys(READINESS_QUESTIONS)) {
    const answer = asked.value[key];
    if (answer?.type !== "bool" || !Number.isFinite(answer.probability)) {
      return err({ kind: "provider", message: `missing ${key} answer` });
    }
    probability.set(key, answer.probability);
  }
  if ((probability.get("tooBig") ?? 0) >= VAGUE_AT)
    return ok({ readiness: "too-big", missing: [] });
  const missing = Object.keys(READINESS_QUESTIONS).filter(
    (k) => k !== "tooBig" && (probability.get(k) ?? 0) >= VAGUE_AT,
  );
  return ok({ readiness: missing.length > 0 ? "needs-detail" : "ready", missing });
}
