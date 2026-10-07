import type { ClassifierBoolQuestion, ClassifierChoiceQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { ArtifactId } from "../../core/sizing.ts";
import type { Sizing } from "../../core/types.ts";
import type { Jev, JevError } from "../client.ts";
import { medianLabel } from "./route.ts";

const LEVELS: readonly Sizing[] = ["fix", "change", "capability", "product"];

export const SIZING_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "How big is the work in `request`, given `repoSummary`? Judge what must be understood and decided, not how much typing it takes. A bug with a known cause is a fix; a behaviour change inside one existing feature is a change; a new user-facing capability spanning several parts is a capability; a new product or a rethink of one is a product.",
  criteria: {
    fix: "A defect or small correction with a known cause, one place, no design decision",
    change:
      "A modification to existing behaviour inside one feature or module, with a clear shape and a test",
    capability:
      "A new user-visible capability that touches several parts, needs a design, or has more than one user journey",
    product:
      "A new product, a new bounded context, or a rethink of who the users are and what outcome they need",
  },
};

const need = (instructions: string): ClassifierBoolQuestion => ({
  type: "bool",
  instructions,
  criteria: {
    true: "Skipping it would likely cost rework or a wrong build",
    false: "The work is clear enough without it",
  },
});

/** One independent judgement per artifact the sizing table does not settle on its own. */
export const ARTIFACT_QUESTIONS = {
  "adr-if-needed": need(
    "Does `request` involve an architectural decision that is costly to reverse and that a future reader will ask 'why' about (a new dependency, data shape, boundary, protocol)?",
  ),
  brief: need(
    "Is it unclear who the users are, what outcome they want, or why this work is worth doing, so a written product brief is needed before building?",
  ),
  journeys: need(
    "Does `request` involve a user performing a sequence of actions to reach an outcome, such that listing those journeys would expose missing steps?",
  ),
  "event-model": need(
    "Does `request` change how information flows through a system with commands, state and views, such that modelling that flow before coding would find gaps?",
  ),
  architecture: need(
    "Does `request` need a statement of how the parts of the system fit together and where the boundaries are, because no such statement exists in `repoSummary`?",
  ),
  "lens-review": need(
    "Do the product assumptions in `request` carry enough risk that independent product-lens critique (value, discovery, strategy) is worth running before building?",
  ),
} as const satisfies Partial<Record<ArtifactId, ClassifierBoolQuestion>>;

export type SizingInput = { request: string; repoSummary: string };
export type SizingJudgement = {
  sizing: Sizing;
  confidence: number;
  artifactNeed: Record<ArtifactId, number>;
};

const REQUEST_MAX = 4000;
const SUMMARY_MAX = 3000;
const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

export async function judgeSizing(
  jev: Jev,
  input: SizingInput,
): Promise<Result<SizingJudgement, JevError>> {
  const asked = await jev.ask(
    {
      request: clip(input.request, REQUEST_MAX),
      repoSummary: clip(input.repoSummary, SUMMARY_MAX),
    },
    { sizing: SIZING_QUESTION, ...ARTIFACT_QUESTIONS },
  );
  if (!asked.ok) return asked;
  const sizing = asked.value.sizing;
  if (sizing?.type !== "choice") return err({ kind: "provider", message: "missing sizing answer" });
  const label = medianLabel(LEVELS, sizing);
  if (label === undefined) return err({ kind: "provider", message: "unknown sizing label" });
  const probabilities: Partial<Record<string, number>> = {};
  for (const key of Object.keys(ARTIFACT_QUESTIONS)) {
    const answer = asked.value[key];
    if (answer?.type !== "bool" || !Number.isFinite(answer.probability)) {
      return err({ kind: "provider", message: `missing ${key} answer` });
    }
    probabilities[key] = answer.probability;
  }
  const p = (key: keyof typeof ARTIFACT_QUESTIONS): number => probabilities[key] ?? 0;
  return ok({
    sizing: label,
    confidence: sizing.confidence,
    artifactNeed: {
      // Fixed by size, never Jev's call; a nonzero need would put them in every "Also consider".
      "task-record": 0,
      review: 0,
      "adr-if-needed": p("adr-if-needed"),
      brief: p("brief"),
      "brief-lite": p("brief"),
      "decision-register": p("brief"),
      journeys: p("journeys"),
      "event-model": p("event-model"),
      architecture: p("architecture"),
      "lens-review": p("lens-review"),
      "lens-review-optional": p("lens-review"),
    },
  });
}
