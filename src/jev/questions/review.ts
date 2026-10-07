import type { ClassifierBoolQuestion, ClassifierChoiceQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import { LENSES, type Lens, SEVERITIES, type Severity } from "../../core/review.ts";
import type { Jev, JevError } from "../client.ts";

const lensQuestion = (instructions: string, yes: string, no: string): ClassifierBoolQuestion => ({
  type: "bool",
  instructions,
  criteria: { true: yes, false: no },
});

export const LENS_QUESTIONS: Readonly<Record<Lens, ClassifierBoolQuestion>> = {
  security: lensQuestion(
    "Does the change in `diffSample` (stat in `diffStat`) touch authentication, authorisation, secrets, cryptography, input parsing from untrusted sources, shell or SQL construction, file paths from users, or network exposure?",
    "It handles untrusted input, credentials, permissions or external exposure",
    "It does not touch any security-relevant surface",
  ),
  concurrency: lensQuestion(
    "Does the change introduce or alter concurrency: threads, async ordering, locks, shared mutable state, retries with side effects, queues, or race-prone file or process handling?",
    "Ordering, sharing or timing between concurrent actors matters to correctness",
    "The code is sequential and has no shared mutable state at risk",
  ),
  types: lensQuestion(
    "Does the change add or alter domain types, parsing of external input, error types, state machines or public function signatures where illegal states could become representable?",
    "It models domain data, parses input, or changes types or errors",
    "It changes no types, parsing or error handling",
  ),
  tests: lensQuestion(
    "Does the change alter behaviour that tests should pin, or alter tests themselves (added, edited, loosened, skipped or deleted)?",
    "Behaviour or tests changed and test adequacy deserves a look",
    "Docs, formatting or configuration only; no behaviour or tests changed",
  ),
  "api-contract": lensQuestion(
    "Does the change alter a public interface: exported functions, CLI flags, tool schemas, file formats, configuration keys, wire formats or documented behaviour that other code or users rely on?",
    "Something other code or users depend on changed shape or meaning",
    "Only internals changed; no external contract is affected",
  ),
  "data-migration": lensQuestion(
    "Does the change alter persisted data shape: schemas, stored entries, migrations, serialised formats, or how existing stored data is read?",
    "Existing stored data must still be read, migrated or preserved correctly",
    "No persisted data shape changes",
  ),
  ux: lensQuestion(
    "Does the change alter what a person sees or does: messages, prompts, commands, output formats, error text, documentation of workflow, or interaction flow?",
    "A human-facing message, flow or output changed",
    "Nothing a person reads or interacts with changed",
  ),
  performance: lensQuestion(
    "Does the change alter work done per request, per item or per run: loops over large inputs, I/O in hot paths, caching, polling, or algorithmic complexity?",
    "Cost grows with input size or call frequency in a way that matters",
    "No meaningful change to time or memory behaviour",
  ),
};

export const SEVERITY_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "Given the review `finding` and the surrounding `diffContext`, how severe is it? Judge by the consequence of shipping it, and by whether the reviewer showed a realistic triggering input. A finding with no demonstrated trigger, or one the code already guards against, is a false positive.",
  criteria: {
    blocking:
      "A demonstrable defect or broken principle: wrong behaviour, data loss, security hole, or a defeated safeguard on a realistic input",
    "should-fix":
      "A real defect or missing test with a realistic trigger, but limited impact or easy workaround",
    nit: "Style, naming, a contrived trigger, or a suggestion with no demonstrated impact",
    "false-positive": "The claim is wrong or the code already handles the case",
  },
};

const DIFF_SAMPLE_MAX = 8000;
const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

export type LensInput = {
  diffStat: string;
  diffSample: string;
  profiles: readonly string[];
};

/** Probability per lens that it applies. One narrow question per lens, asked together. */
export async function judgeLenses(
  jev: Jev,
  input: LensInput,
): Promise<Result<Record<Lens, number>, JevError>> {
  const asked = await jev.ask(
    {
      diffStat: clip(input.diffStat, 2000),
      diffSample: clip(input.diffSample, DIFF_SAMPLE_MAX),
      profiles: input.profiles.slice(0, 5).map((p) => clip(p, 40)),
    },
    LENS_QUESTIONS,
  );
  if (!asked.ok) return asked;
  const out = {} as Record<Lens, number>;
  for (const lens of LENSES) {
    const answer = asked.value[lens];
    if (answer?.type !== "bool" || !Number.isFinite(answer.probability)) {
      return err({ kind: "provider", message: `missing or malformed answer for lens ${lens}` });
    }
    out[lens] = answer.probability;
  }
  return ok(out);
}

export type SeverityInput = { finding: string; diffContext: string };

export async function judgeSeverity(
  jev: Jev,
  input: SeverityInput,
): Promise<Result<{ severity: Severity; confidence: number }, JevError>> {
  const asked = await jev.ask(
    { finding: clip(input.finding, 2000), diffContext: clip(input.diffContext, 6000) },
    { severity: SEVERITY_QUESTION },
  );
  if (!asked.ok) return asked;
  const answer = asked.value.severity;
  if (answer?.type !== "choice") {
    return err({ kind: "provider", message: "missing severity answer" });
  }
  const label = SEVERITIES.find((s) => s === answer.choice);
  if (label === undefined) {
    return err({ kind: "provider", message: `unknown severity label "${answer.choice}"` });
  }
  return ok({ severity: label, confidence: answer.confidence });
}
