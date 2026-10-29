import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { TaskRecord } from "../../planning/task-record.ts";
import type { Jev, JevError } from "../client.ts";

const vague = (instructions: string): ClassifierBoolQuestion => ({
  type: "bool",
  instructions,
  criteria: {
    true: "A concrete required behavior, public contract or verification decision is missing or explicitly undecided",
    false:
      "The required behavior is stated or references an existing contract; remaining choices are ordinary implementation details, not missing requirements",
  },
});

/** Advisory handoff concerns, not implementation prerequisites or a specification-completeness score. */
export const READINESS_QUESTIONS = {
  goal: vague(
    "`task.goal` should be one observable sentence: something a person or test could see change. Is it vague, a restatement of the title, or about activity rather than outcome?",
  ),
  interfaces: vague(
    "Does `task.interfaces` leave a required public contract decision explicitly unresolved or contradict the requested behavior? In particular an undecided public return/error contract needs a decision. Existing contracts can be referenced, not copied. Do not invent additional requirements beyond the requested behavior, or flag internal helper signatures/local design choices.",
  ),
  firstFailingTest: vague(
    "`task.firstFailingTest` should name a test file and test and say what it asserts. Does it fail to say what would be asserted, or assert something unrelated to `task.goal`?",
  ),
  steps: vague(
    "Do `task.steps` omit a necessary dependency or put implementation before the behavioral test? A short test-implement-verify sequence is sufficient; do not require independently reviewable microsteps.",
  ),
  check: vague(
    "`task.run` should be an actual command a person can type, and `task.expected` an observable result such as a count, output or exit status. Is `run` prose or a placeholder rather than a command (for example 'run the tests'), or is `expected` a restatement of success (for example 'tests pass', 'should work') rather than something observed?",
  ),
  tooBig: {
    type: "bool",
    instructions:
      "Does this bundle separately deliverable capabilities or unrelated outcomes that could ship and be accepted independently? Do not split dependent implementation components of one end-to-end capability. Multiple tests, functions or files alone are not evidence. Recommend decomposition only when independent delivery boundaries outweigh extra planning, handoff, review and integration overhead.",
    criteria: {
      true: "Independent deliverable outcomes suggest considering decomposition",
      false: "It is one coherent task a single implementer can finish",
    },
  },
} as const satisfies Record<string, ClassifierBoolQuestion>;

type Readiness = "ready" | "needs-detail" | "too-big";
export type ReadinessJudgement = { readiness: Readiness; missing: string[] };

/** Probability at or above which an aspect counts as vague. */
const VAGUE_AT = 0.6;

// Refuse an oversized advisory request instead of judging a silently truncated task.
const MAX_CONTEXT_BYTES = 32_768;

export async function judgeTaskReadiness(
  jev: Jev,
  record: TaskRecord,
): Promise<Result<ReadinessJudgement, JevError>> {
  const task = {
    title: redactSecrets(record.title),
    goal: redactSecrets(record.goal),
    files: record.files.map(redactSecrets),
    interfaces: redactSecrets(record.interfaces),
    firstFailingTest: redactSecrets(record.firstFailingTest),
    steps: record.steps.map(redactSecrets),
    run: redactSecrets(record.run),
    expected: redactSecrets(record.expected),
    outOfScope: redactSecrets(record.outOfScope),
  };
  if (Buffer.byteLength(JSON.stringify(task), "utf8") > MAX_CONTEXT_BYTES) {
    return err({ kind: "provider", message: "task context exceeds 32 KiB; not classified" });
  }
  const asked = await jev.ask({ task }, READINESS_QUESTIONS);
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
