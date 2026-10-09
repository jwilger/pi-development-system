/**
 * Product-lens review (plan I9.3): five fresh lens agents read the brief independently (round 1),
 * then answer each other (round 2), and the coordinator synthesises. This module is pure: it builds
 * the prompts, the `agent_spawn` payloads and the codemode script; the tool in
 * `lens-review-tool.ts` supplies the date, models and lens choice.
 */

import type { ThinkingLevel } from "../core/spawn-overrides.ts";

export const PRODUCT_LENSES = ["cagan", "torres", "pichler", "perri", "rumelt"] as const;
export type ProductLens = (typeof PRODUCT_LENSES)[number];

/** A lens applies at or above this probability (same cut-off as the code-review lenses). */
const PRODUCT_LENS_THRESHOLD = 0.5;

export const GUARDRAIL =
  "Agreement among agents is useful critique, not customer evidence. A finding that rests on opinion rather than data says so.";

export type ReviewRound = 1 | 2;

export const reviewPath = (date: string, kind: ReviewRound | "synthesis"): string =>
  `docs/product/reviews/${date}-${kind === "synthesis" ? "synthesis" : `round${kind}`}.md`;

export const selectProductLenses = (
  probabilities: Readonly<Record<ProductLens, number>>,
): ProductLens[] => PRODUCT_LENSES.filter((lens) => probabilities[lens] >= PRODUCT_LENS_THRESHOLD);

const PACKET = [
  "## Review — <artifact> — round <n> — lenses: <lens>",
  "### Sources inspected",
  "- <path:line ranges>",
  "### Findings",
  "- [blocking|should-fix|nit] <lens> `<path>:<line>` — <one sentence> — <why it matters>",
  "### Verdict",
  "no-blocking | blocking",
].join("\n");

type LensTaskInput = {
  lens: ProductLens;
  briefPath: string;
  round: ReviewRound;
  /** Where round 1 was written; round 2 reads the peers' findings there. */
  round1Path: string;
};

const ROUND_ONE =
  "This is round 1 and it is independent: judge the artifact through your own lens and do not look at other lenses' output.";

const roundTwo = (round1Path: string): string =>
  `This is round 2, a peer exchange: read the round 1 packets in \`${round1Path}\`. For each peer finding, say whether you agree, disagree or would reword it, and why, from your own lens. Raise anything the exchange made newly visible. Do not repeat your own round 1 findings.`;

/** The task text one lens agent receives. */
function lensTask(input: LensTaskInput): string {
  return [
    `You are the ${input.lens} lens. Review \`${input.briefPath}\` and any artifact it links (decision register, follow-ups, terminology, journeys, ADRs).`,
    input.round === 1 ? ROUND_ONE : roundTwo(input.round1Path),
    GUARDRAIL,
    "Cite `path:line` for every finding. Do not edit files.",
    `Answer with exactly this packet (round ${input.round}), then a **Not verified** list and a **Route** line saying where each finding should go (decision register, follow-ups, interview question, ignore):`,
    PACKET,
  ].join("\n\n");
}

export type SpawnPayload = {
  path: string;
  type: string;
  task: string;
  thinkingLevel: ThinkingLevel;
  wait: false;
  model?: string;
};

export type PayloadInput = {
  lenses: readonly ProductLens[];
  briefPath: string;
  round: ReviewRound;
  date: string;
  /** Makes the agent paths fresh: a failed spawn must not leave a thread that blocks the retry. */
  suffix: string;
  thinkingLevel: ThinkingLevel;
  model?: string | undefined;
};

/** One fresh `agent_spawn` payload per lens, each of its own `lens-*` agent type. */
export function lensPayloads(input: PayloadInput): SpawnPayload[] {
  const round1Path = reviewPath(input.date, 1);
  return input.lenses.map((lens) => ({
    path: `/lens-r${input.round}-${lens}-${input.suffix}`,
    type: `lens-${lens}`,
    task: lensTask({ lens, briefPath: input.briefPath, round: input.round, round1Path }),
    thinkingLevel: input.thinkingLevel,
    wait: false as const,
    ...(input.model === undefined ? {} : { model: input.model }),
  }));
}

export type ScriptInput = {
  payloads: readonly SpawnPayload[];
  file: string;
  round: ReviewRound;
};

/**
 * The codemode script: spawn every lens detached, wait for all, write the packets to one file and
 * return only a verdict line per lens plus the path, so the packets never enter the coordinator's context.
 */
export function lensReviewScript(input: ScriptInput): string {
  const lenses = input.payloads.map((p) => ({ path: p.path, lens: p.type.replace(/^lens-/, "") }));
  return `// @options: {"timeout_ms": 1800000}
const payloads = ${JSON.stringify(input.payloads)};
const lenses = ${JSON.stringify(lenses)};
const file = ${JSON.stringify(input.file)};
await Promise.allSettled(payloads.map((p) => tools.agent_spawn({ ...p, wait: false })));
const packets = await Promise.all(
  lenses.map(async ({ path, lens }) => {
    try {
      await tools.agent_wait({ path, timeoutMs: 1500000 });
      // agent_output returns one page at a time; the verdict is at the end, so read every page.
      let packet = "";
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const raw = String(await tools.agent_output({ path, offset, limit: 16000 }));
        let text = raw;
        let next = null;
        try {
          const record = JSON.parse(raw);
          if (record && typeof record.text === "string") {
            text = record.text;
            next = typeof record.nextOffset === "number" ? record.nextOffset : null;
          }
        } catch {}
        packet += text;
        if (next === null) break;
        offset = next;
      }
      const found = /###\\s*Verdict\\s*\\n+\\s*(no-blocking|blocking)/i.exec(packet);
      return { lens, packet, verdict: found ? found[1].toLowerCase() : "no verdict" };
    } catch (e) {
      return { lens, packet: "", verdict: "no packet (" + (e && e.message ? e.message : String(e)) + ")" };
    }
  }),
);
const body = packets
  .map((r) => "## " + r.lens + " — round ${input.round}\\n\\n" + (r.packet || "_" + r.verdict + "_"))
  .join("\\n\\n");
await tools.write({ path: file, content: "# Lens review — round ${input.round}\\n\\n" + body + "\\n" });
return packets.map((r) => r.lens + ": " + r.verdict).join("\\n") + "\\nwritten: " + file;
`;
}

/** The synthesis the coordinator writes after round 2: dispositions by id, then ONE next question. */
export function synthesisTemplate(date: string): string {
  return [
    `# Lens review synthesis — ${date}`,
    "",
    `> ${GUARDRAIL}`,
    "",
    "Sources: round 1 and round 2 review files in this directory.",
    "",
    "| R-id | Finding | Lenses | Disposition | Route |",
    "| --- | --- | --- | --- | --- |",
    "| R1 | <finding, one sentence> | <lenses that raised or backed it> | adopt / defer / reject — <why> | decision register / follow-ups / interview / ignore |",
    "",
    "## Interview agenda",
    "",
    "Ask the user one question next — the one whose answer removes the most risk from the R-table: <question>",
    "",
    "Everything else waits in follow-ups until the answer is in.",
    "",
  ].join("\n");
}
