import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { resolveSlot } from "../core/models.ts";
import type { Jev } from "../jev/client.ts";
import { judgeProductLenses } from "../jev/questions/product-lenses.ts";
import {
  judgeSolutionDetail,
  SOLUTION_DETAIL_THRESHOLD,
} from "../jev/questions/solution-detail.ts";
import { lintBrief } from "../planning/brief-lint.ts";
import { CONFIG_FILE, loadConfig } from "../state/config.ts";
import { availableModels } from "../state/models-command.ts";
import type { SessionState } from "../state/session-state.ts";
import {
  lensPayloads,
  lensReviewScript,
  PRODUCT_LENSES,
  type ProductLens,
  type ReviewRound,
  reviewPath,
  selectProductLenses,
  synthesisTemplate,
} from "./lens-review.ts";

export type LensReviewDeps = {
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
  now: () => Date;
};

const DEFAULT_BRIEF = "docs/product/brief.md";

const Parameters = Type.Object({
  brief: Type.Optional(
    Type.String({ description: `Path of the brief to review; defaults to ${DEFAULT_BRIEF}.` }),
  ),
  round: Type.Optional(
    Type.Number({
      description: "1 = independent review (default); 2 = peer exchange after round 1 was written.",
    }),
  ),
});

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

type Choice = { lenses: readonly ProductLens[]; basis: string };

/** All five for a `product`; for anything else Jev picks, and an offline or empty answer means all five. */
async function chooseLenses(
  deps: LensReviewDeps,
  ctx: ExtensionContext,
  brief: string,
): Promise<Choice> {
  if (deps.state.get().sizing === "product") {
    return { lenses: PRODUCT_LENSES, basis: "sizing is product: all five lenses." };
  }
  const judged = await judgeProductLenses(deps.jev(ctx), { brief });
  if (!judged.ok) {
    return {
      lenses: PRODUCT_LENSES,
      basis: `Jev unavailable (${judged.error.kind}); using all five lenses.`,
    };
  }
  const picked = selectProductLenses(judged.value);
  return picked.length === 0
    ? { lenses: PRODUCT_LENSES, basis: "Jev found no specific lens; using all five lenses." }
    : { lenses: picked, basis: "Jev chose the lenses for this brief." };
}

/** Warnings about solution-level detail in the brief: regex markers plus, when none match, Jev's read. Never an error. */
async function briefLint(
  deps: LensReviewDeps,
  ctx: ExtensionContext,
  brief: string,
): Promise<string[]> {
  const found = lintBrief(brief);
  if (found.length > 0) {
    return found.map((f) => `- line ${f.line}: \`${f.match}\` (${f.kind}) — ${f.message}`);
  }
  const judged = await judgeSolutionDetail(deps.jev(ctx), { brief });
  return judged.ok && judged.value >= SOLUTION_DETAIL_THRESHOLD
    ? [
        "- the brief prescribes the solution (tables, endpoints, classes or libraries) rather than the outcome; record that in an ADR (devsys_adr_new) or the architecture notes",
      ]
    : [];
}

/** The date of the newest `docs/product/reviews/<date>-round1.md`, if any. */
function latestRound1Date(cwd: string): string | undefined {
  try {
    return readdirSync(join(cwd, "docs/product/reviews"))
      .flatMap((name) => /^(\d{4}-\d{2}-\d{2})-round1\.md$/.exec(name)?.[1] ?? [])
      .sort()
      .pop();
  } catch {
    return undefined;
  }
}

/** The lenses that wrote round 1, from its `## <lens> — round 1` headings; empty when none parse. */
function round1Lenses(cwd: string, date: string): ProductLens[] {
  try {
    const body = readFileSync(join(cwd, reviewPath(date, 1)), "utf8");
    return PRODUCT_LENSES.filter((lens) => `\n${body}`.includes(`\n## ${lens} — round 1`));
  } catch {
    return [];
  }
}

const parseRound = (given: number | undefined): ReviewRound | undefined => {
  const round = given ?? 1;
  return round === 1 || round === 2 ? round : undefined;
};

/**
 * `devsys_lens_review`: the plan for a product-lens review round. Returns a codemode script as the
 * primary form (the packets go to a file, not into the coordinator's context) and the fresh
 * `agent_spawn` payloads as the fallback.
 */
export function createLensReviewTool(deps: LensReviewDeps): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_lens_review",
    label: "Lens review",
    description:
      "Plan a product-lens review of a brief: the five Cagan/Torres/Pichler/Perri/Rumelt lens agents, as a codemode script that writes their packets to docs/product/reviews/<date>-round<n>.md and returns only verdict lines, plus the agent_spawn payloads as a fallback. Round 2 is the peer exchange.",
    promptSnippet: "Plan a product-lens review of the brief",
    parameters: Parameters,
    async execute(
      _id,
      params: Static<typeof Parameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const round = parseRound(params.round);
      if (round === undefined) {
        return reply("round must be 1 (independent) or 2 (peer exchange)", true);
      }
      const briefPath = params.brief?.trim() || DEFAULT_BRIEF;
      let brief: string;
      try {
        brief = await readFile(resolve(ctx.cwd, briefPath), "utf8");
      } catch {
        return reply(
          `cannot read the brief at ${briefPath}; write it first (product-planning skill)`,
          true,
        );
      }
      const today = deps.now().toISOString().slice(0, 10);
      // Round 2 pairs with the newest round 1 on disk, which may be from an earlier day.
      const date = round === 2 ? latestRound1Date(ctx.cwd) : today;
      if (date === undefined) {
        return reply(
          "round 2 reads a round1 review (docs/product/reviews/<date>-round1.md), and none exists yet; run round 1 first",
          true,
        );
      }
      const config = await loadConfig(ctx.cwd);
      if (!config.ok) return reply(`${CONFIG_FILE}: ${config.error.message}`, true);
      const resolved = resolveSlot(config.value.models, "lens", availableModels(ctx.modelRegistry));
      const earlier = round === 2 ? round1Lenses(ctx.cwd, date) : [];
      // Both ask Jev; run them together so a hung provider costs one timeout, not two.
      const [{ lenses, basis }, lint] = await Promise.all([
        earlier.length > 0
          ? { lenses: earlier, basis: "round 2 asks the lenses that wrote round 1." }
          : chooseLenses(deps, ctx, brief),
        briefLint(deps, ctx, brief),
      ]);
      const payloads = lensPayloads({
        lenses,
        briefPath,
        round,
        date,
        suffix: deps.now().getTime().toString(36),
        thinkingLevel: config.value.review.thinkingLevel,
        model: resolved.ok ? resolved.value.model : undefined,
      });
      const file = reviewPath(date, round);
      const script = lensReviewScript({ payloads, file, round });
      return reply(
        [
          `Lens review, round ${round}, of ${briefPath}. ${basis}`,
          `lenses: ${lenses.join(", ")}; packets go to ${file}`,
          ...(lint.length > 0 ? ["Brief lint (warnings; the review still runs):", ...lint] : []),
          "Run this with the codemode tool, unchanged. It spawns the lens agents, waits, writes the packets and returns only a verdict per lens and the path:",
          "```js",
          script,
          "```",
          `Fallback if codemode is unavailable: call agent_spawn once per payload below (all with wait:false), agent_wait on each, and write the packets to the file yourself, each under a heading '## <lens> — round ${round}' (round 2 reads those headings to find who wrote round 1).`,
          JSON.stringify(payloads),
          round === 1
            ? "After round 2, write the synthesis with this template:"
            : `Then write ${reviewPath(date, "synthesis")} with this template:`,
          synthesisTemplate(date),
        ].join("\n"),
      );
    },
  };
}
