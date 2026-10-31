import type { ClassifierAnswer, ClassifierQuestion, JsonObject } from "@earendil-works/pi-ai";
import { err, type Result } from "../core/result.ts";
import type { Jev, JevAskOptions, JevError } from "./client.ts";

export type Answers = Record<string, ClassifierAnswer>;
export type ReasoningAssessor = (
  state: JsonObject,
  questions: Record<string, ClassifierQuestion>,
  options?: JevAskOptions,
) => Promise<Result<Answers, JevError>>;

const unit = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;
const unknown = (label: string): boolean => /^(unknown|unclear|unsure|unresolved)$/u.test(label);

/** Safe diagnostic categories only: never include provider output or raw answer values. */
export function answerIssue(
  answers: Answers,
  questions: Record<string, ClassifierQuestion>,
): string | undefined {
  for (const [key, question] of Object.entries(questions)) {
    const name = key.replace(/[^a-zA-Z0-9_-]/g, "?").slice(0, 80);
    const answer = answers[key];
    if (answer === undefined) return `${name}: missing answer`;
    if (answer.type !== question.type) return `${name}: wrong answer type`;
    if (resolvedAnswers({ [key]: answer }, { [key]: question })) continue;
    if (answer.type === "bool" && unit(answer.probability))
      return `${name}: uncertain boolean; supply contract evidence or narrow the change`;
    if (answer.type === "score" && unit(answer.score) && unit(answer.confidence))
      return `${name}: low confidence; supply evidence or narrow the change`;
    if (
      answer.type === "choice" &&
      question.type === "choice" &&
      Object.hasOwn(question.criteria, answer.choice)
    ) {
      if (unknown(answer.choice))
        return `${name}: unresolved choice; supply missing contract evidence`;
      if (unit(answer.confidence) && answer.confidence < 0.8)
        return `${name}: low confidence; supply evidence or narrow the change`;
    }
    return `${name}: invalid answer values or inconsistent choice distribution; repair the assessor response`;
  }
  return undefined;
}

/** Conservative common floor; consumers may still apply stricter substantive policy. */
function resolvedAnswers(answers: Answers, questions: Record<string, ClassifierQuestion>): boolean {
  return Object.entries(questions).every(([key, question]) => {
    const answer = answers[key];
    if (answer === undefined || answer.type !== question.type) return false;
    switch (answer.type) {
      case "bool":
        return unit(answer.probability) && (answer.probability <= 0.2 || answer.probability >= 0.8);
      case "score":
        return unit(answer.score) && unit(answer.confidence) && answer.confidence >= 0.8;
      case "choice": {
        if (question.type !== "choice") return false;
        const entries = Object.entries(answer.probabilities);
        return (
          Object.hasOwn(question.criteria, answer.choice) &&
          !unknown(answer.choice) &&
          unit(answer.confidence) &&
          answer.confidence >= 0.8 &&
          Object.keys(question.criteria).every((label) =>
            unit(answer.probabilities[label] ?? Number.NaN),
          ) &&
          entries.every(
            ([label, p]) =>
              Object.hasOwn(question.criteria, label) &&
              unit(p) &&
              p <= (answer.probabilities[answer.choice] ?? -1),
          ) &&
          Math.abs(entries.reduce((sum, [, p]) => sum + p, 0) - 1) < 0.01
        );
      }
      default:
        return false;
    }
  });
}

/** Assessment is not permission. Unresolved reasoning stays an error, never a human prompt. */
export function withReasoningFallback(primary: Jev, assess: ReasoningAssessor): Jev {
  return {
    availability: () => primary.availability(),
    model: () => primary.model(),
    async ask(state, questions, options) {
      if (options?.signal?.aborted) return err({ kind: "aborted" });
      const judged = await primary.ask(state, questions, options);
      if (options?.signal?.aborted) return err({ kind: "aborted" });
      if (judged.ok && resolvedAnswers(judged.value, questions)) return judged;
      if (
        !judged.ok &&
        (judged.error.kind === "aborted" || judged.error.kind === "usage-recording")
      )
        return judged;
      const assessed = await assess(state, questions, options).catch(() =>
        err<JevError>({
          kind: "assessment-unresolved",
          message:
            "Reasoning request failed; inspect model configuration and evidence, then retry.",
        }),
      );
      if (options?.signal?.aborted) return err({ kind: "aborted" });
      if (!assessed.ok) return assessed;
      return resolvedAnswers(assessed.value, questions)
        ? assessed
        : err({
            kind: "assessment-unresolved",
            message:
              "Reasoning could not resolve the judgment. Inspect the evidence, supply missing context or simplify the operation, then retry; classifier uncertainty is not a request for human approval.",
          });
    },
  };
}
