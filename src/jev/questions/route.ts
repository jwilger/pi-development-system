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
    "How hard is the coding `task` for a capable engineer, given the `files` it touches? Judge the reasoning and design needed, not the amount of typing. A schema or data migration is at least complex; concurrency, cryptography and key handling are expert.",
  criteria: {
    trivial: "Mechanical and local: a rename, a typo, a one-line config, copy or style change",
    routine:
      "Well-understood change in one area following an existing pattern or adding a small self-contained function or flag, with a clear test",
    complex:
      "Several modules interact, a schema or data migration is involved, a new abstraction or state machine is needed, or behaviour is subtle",
    expert:
      "Concurrency, cryptography or key management, security protocols, or architecture decisions where a wrong choice is costly to find",
  },
};

export const RISK_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "How costly is it if the result of `task` (touching `files`, with `riskSignals`) is subtly wrong and ships? Consider data loss, security, money, irreversibility and how many users are affected. Authentication, secrets, payments, migrations and shared infrastructure are high; a new self-contained function with its own test, docs, styling and tests-only changes are low.",
  criteria: {
    low: "Easy to notice and revert: docs, styling, tests, internal tooling, or a new self-contained function with its own test",
    medium:
      "A defect would affect users or other code but is visible and recoverable; changes to existing shared behaviour",
    high: "A defect could lose data, expose secrets, break authentication, authorisation or money flows, or be hard to undo",
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
      if (cumulative >= 0.5) return level;
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
