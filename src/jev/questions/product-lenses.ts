import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import { PRODUCT_LENSES, type ProductLens } from "../../review/lens-review.ts";
import type { Jev, JevError } from "../client.ts";

const lensQuestion = (instructions: string, yes: string, no: string): ClassifierBoolQuestion => ({
  type: "bool",
  instructions,
  criteria: { true: yes, false: no },
});

/** One narrow question per product lens: does this lens have something to say about the brief? */
export const PRODUCT_LENS_QUESTIONS: Readonly<Record<ProductLens, ClassifierBoolQuestion>> = {
  cagan: lensQuestion(
    "Read the `brief`. Does it commit to building a product or feature while leaving a value, usability, feasibility or viability risk unnamed or untested? A trivial copy, rename or maintenance change carries no such risk.",
    "It proposes something to build and names no test or evidence for at least one of those risks",
    "The change is trivial, or the brief names its risks and a test or evidence for them",
  ),
  torres: lensQuestion(
    "Read the `brief`. Does it claim what customers need or want without citing discovery evidence (interviews, observed behaviour, usage data)? A brief that makes no customer claim does not count.",
    "It asserts customer needs, demand or behaviour with no discovery evidence cited",
    "Customer claims are backed by cited evidence, or the brief makes no customer claim",
  ),
  pichler: lensQuestion(
    "Read the `brief`. Does it lack a measurable goal or metric that ties the work to a product vision or strategy? A trivial copy, rename or maintenance change needs none.",
    "It proposes substantial work with no measurable goal or metric tied to a vision",
    "It names a measurable goal or metric, or the change is trivial",
  ),
  perri: lensQuestion(
    "Read the `brief`. Does it define success as shipping features or deliverables rather than as a measurable change for customers or the business? A typo fix, rename, dependency upgrade or other maintenance change is not a product bet and always answers false.",
    "A product bet whose success is framed as delivering a list of features or a launch date, with no outcome measure",
    "Success is a measurable outcome, or the change is maintenance (typo, rename, upgrade, refactor)",
  ),
  rumelt: lensQuestion(
    "Read the `brief`. Does it state goals or ambitions without a diagnosis of the real challenge, a guiding policy and coherent actions? A trivial copy, rename or maintenance change needs no strategy.",
    "It lists goals, ambitions or features with no diagnosis of the challenge and no guiding policy",
    "It diagnoses the challenge and sets a policy and actions, or the change is trivial",
  ),
};

const BRIEF_CLIP = 8000;

// Bound the text before redacting (redaction cost grows with run length); keep margin so a secret at the cut is still seen whole.
const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

/** Probability per product lens that it applies to the brief. */
export async function judgeProductLenses(
  jev: Jev,
  input: { brief: string },
): Promise<Result<Record<ProductLens, number>, JevError>> {
  const asked = await jev.ask({ brief: clip(input.brief, BRIEF_CLIP) }, PRODUCT_LENS_QUESTIONS);
  if (!asked.ok) return asked;
  const out = {} as Record<ProductLens, number>;
  for (const lens of PRODUCT_LENSES) {
    const answer = asked.value[lens];
    if (answer?.type !== "bool" || !Number.isFinite(answer.probability)) {
      return err({ kind: "provider", message: `missing or malformed answer for lens ${lens}` });
    }
    out[lens] = answer.probability;
  }
  return ok(out);
}
