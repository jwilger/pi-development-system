import type { ClassifierChoiceQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import { DIFFICULTIES, type Difficulty, RISKS, type RiskLevel } from "../../core/routing.ts";
import type { Jev, JevError } from "../client.ts";

export type RouteInput = {
  task: string;
  filesTouched: readonly string[];
  riskSignals?: readonly string[];
};
export type RouteJudgement = { difficulty: Difficulty; risk: RiskLevel; confidence: number };

export const DIFFICULTY_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "How hard is the coding `task` for a capable engineer, given the `files` it touches? Judge reasoning and design separately from risk, not the amount of typing. Mechanical edits exclude security-policy changes: changing an existing security parameter needs validation and is routine, even if the edit is one line; it is not expert unless new security protocols, cryptography or key management are involved. A schema or data migration or new state machine is at least complex; concurrency, cryptography and key handling are expert.",
  criteria: {
    trivial:
      "Mechanical and local with no policy reasoning: a rename, typo, copy, style or non-security config edit",
    routine:
      "Well-understood change in one area following an existing pattern: a small self-contained function or flag, or changing a security-policy parameter using an existing mechanism rather than designing a new protocol",
    complex:
      "Several modules interact, a schema or data migration is involved, a new abstraction or state machine is needed, or behaviour is subtle",
    expert:
      "Concurrency, cryptography or key management, security protocols, or architecture decisions where a wrong choice is costly to find",
  },
};

export const RISK_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "How costly is it if the result of `task` (touching `files`, with `riskSignals`) is subtly wrong and ships? Judge the behavior actually changed, not just the application or filename. Direct authentication, secrets, payment-processing, migration and shared worker/job infrastructure changes are high; concurrent duplicate job processing can cause lasting side effects. An application view or control-flow state-machine refactor is medium when it preserves those contracts: do not infer a payment-processing change just from a checkout or basket name. New self-contained functions with their own tests, docs, styling and tests-only changes are low.",
  criteria: {
    low: "Easy to notice and revert: docs, styling, tests, internal tooling, or a new self-contained function with its own test",
    medium:
      "A defect would affect users or other code but is visible and recoverable; existing shared behavior or view/control-flow state changes that do not alter security, payment-processing or persisted-data contracts",
    high: "Direct changes to authentication or authorization policy, secrets, payment processing, data migrations or shared worker/job infrastructure; a defect could lose data, duplicate consequential work, expose secrets or be hard to undo",
  },
};

const TASK_CLIP = 4000;
const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

/**
 * Difficulty and risk are ordinal, so the label is the probability-weighted median, not the argmax:
 * mass spread over neighbouring levels ("complex 0.33, expert 0.5") still lands on the right side.
 * Falls back to the answer's own label when it carries no usable probabilities.
 */
export function medianLabel<T extends string>(
  levels: readonly T[],
  answer: { choice: string; probabilities: Readonly<Record<string, number>> },
): T | undefined {
  const total = levels.reduce((sum, level) => sum + (answer.probabilities[level] ?? 0), 0);
  if (total > 0) {
    let cumulative = 0;
    for (const level of levels) {
      cumulative += (answer.probabilities[level] ?? 0) / total;
      if (cumulative > 0.5) return level;
    }
  }
  return levels.find((level) => level === answer.choice);
}

export async function judgeTaskRouting(
  jev: Jev,
  input: RouteInput,
): Promise<Result<RouteJudgement, JevError>> {
  const asked = await jev.ask(
    {
      task: clip(input.task, TASK_CLIP),
      files: input.filesTouched.slice(0, 50).map((f) => clip(f, 200)),
      riskSignals: (input.riskSignals ?? []).slice(0, 20).map((s) => clip(s, 200)),
    },
    { difficulty: DIFFICULTY_QUESTION, risk: RISK_QUESTION },
  );
  if (!asked.ok) return asked;
  const difficulty = asked.value.difficulty;
  const risk = asked.value.risk;
  if (difficulty?.type !== "choice" || risk?.type !== "choice") {
    return err({ kind: "provider", message: "missing routing answers" });
  }
  const d = medianLabel(DIFFICULTIES, difficulty);
  const r = medianLabel(RISKS, risk);
  if (d === undefined || r === undefined) {
    return err({ kind: "provider", message: "unknown routing labels" });
  }
  return ok({
    difficulty: d,
    risk: r,
    confidence: Math.min(difficulty.confidence, risk.confidence),
  });
}
