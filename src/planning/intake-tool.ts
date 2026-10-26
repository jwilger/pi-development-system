import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { parseSizing } from "../core/sizing.ts";
import { type DevsysState, isParseError, type Sizing, type SliceRef } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { withJevToolUsage } from "../jev/execution.ts";
import { judgeSizing } from "../jev/questions/sizing.ts";
import type { SessionState } from "../state/session-state.ts";
import { sameWorkflow } from "../state/workflow.ts";
import {
  decideSize,
  phaseFor,
  proposeArtifacts,
  renderProposal,
  type SizeDecision,
  sliceSlug,
  uniqueSlice,
} from "./intake.ts";

const Parameters = Type.Object({
  request: Type.String({ description: "What the user asked for, in their words." }),
  repoSummary: Type.Optional(
    Type.String({ description: "One or two sentences on the repository, if known." }),
  ),
  size: Type.Optional(
    Type.String({
      description:
        "fix, change, capability or product, when the size is already decided (for example during a goal's up-front planning). Skips Jev's sizing question and the user's.",
    }),
  ),
});

const SIZES: readonly Sizing[] = ["fix", "change", "capability", "product"];

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

function sizingCancelled(
  signal: AbortSignal | undefined,
  judgement: Awaited<ReturnType<typeof judgeSizing>> | undefined,
): boolean {
  return (
    signal?.aborted === true || (judgement?.ok === false && judgement.error.kind === "aborted")
  );
}

function sizingDecision(
  given: Sizing | undefined,
  judgement: Awaited<ReturnType<typeof judgeSizing>> | undefined,
): SizeDecision {
  return decideSize(
    given,
    judgement?.ok ? judgement.value : undefined,
    judgement?.ok === false ? judgement.error.kind : "not asked",
  );
}

/** Proposed size first, so the default selection is the proposal. */
const sizeChoices = (proposed: Sizing): string[] => [
  proposed,
  ...SIZES.filter((s) => s !== proposed),
];

const slicesInUse = (state: DevsysState): Set<string> =>
  new Set([
    ...(state.activeSlice === undefined ? [] : [state.activeSlice]),
    ...(state.reviews ?? []).map((r) => r.slice),
    ...state.openDepartures.flatMap((d) => (d.scope.kind === "slice" ? [d.scope.slice] : [])),
  ]);

/** Starting new work replaces the active slice; while it is in flight that needs the user's yes. */
async function declinedToReplace(
  ctx: ExtensionContext,
  before: DevsysState,
): Promise<string | undefined> {
  const { activeSlice, phase } = before;
  const inFlight = phase === "implementing" || phase === "reviewing" || phase === "delivering";
  if (activeSlice === undefined || !inFlight) return undefined;
  if (!ctx.hasUI) {
    return `Slice "${activeSlice}" is still ${phase}; replacing it needs the user's yes, and there is no UI to ask. Intake cancelled; slice "${activeSlice}" is unchanged.`;
  }
  const go = await ctx.ui.confirm(
    "Slice already in flight",
    `Slice "${activeSlice}" is still ${phase}. Its uncommitted or unpushed changes would ship under the new slice's rules. Start new work anyway?`,
  );
  return go ? undefined : `Intake cancelled; slice "${activeSlice}" is unchanged.`;
}

type Chosen = { readonly sizing: Sizing } | { readonly stop: string; readonly isError: boolean };

/** A decided size passes through; an undecided one asks the user (headless: stops with the proposal). */
async function chooseSize(
  ctx: ExtensionContext,
  decision: SizeDecision,
  proposalFor: (size: Sizing) => ReturnType<typeof proposeArtifacts>,
): Promise<Chosen> {
  if (decision.kind === "decided") return { sizing: decision.size };
  const { basis, proposed } = decision;
  const proposal = renderProposal({ sizing: proposed, basis, proposal: proposalFor(proposed) });
  if (!ctx.hasUI) {
    return { stop: `${proposal}\nHeadless: proposal only, not applied.`, isError: false };
  }
  const picked = await ctx.ui.select(`Size this work (${basis})`, sizeChoices(proposed));
  if (picked === undefined) {
    return { stop: `${proposal}\nIntake cancelled; nothing changed.`, isError: false };
  }
  const parsed = parseSizing(picked);
  return isParseError(parsed) ? { stop: parsed.message, isError: true } : { sizing: parsed };
}

/** `devsys_intake`: Jev (or the caller) sizes the work; only a doubtful Jev asks the user; state moves to the first phase. */
function buildIntakeTool(deps: {
  pi: ExtensionAPI;
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
}): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_intake",
    label: "Start work",
    description:
      "Size a request (fix, change, capability, product) and list the planning artifacts that size needs. " +
      "Jev sizes the work and the user is asked only when Jev is under 50% confident; pass `size` when it is already decided. Then phase, sizing and the active slice are set. Call at the start of any non-trivial work.",
    promptSnippet: "Size new work and propose the planning artifacts it needs",
    parameters: Parameters,
    exposure: "model-only",
    executionMode: "sequential",
    async execute(_id, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const request = params.request.trim();
      if (request === "") return reply("request must not be empty", true);
      const given = params.size === undefined ? undefined : parseSizing(params.size.trim());
      if (given !== undefined && isParseError(given)) return reply(given.message, true);
      const initial = deps.state.get();
      const judged =
        given === undefined
          ? await judgeSizing(deps.jev(ctx), { request, repoSummary: params.repoSummary ?? "" })
          : undefined;
      if (sizingCancelled(_signal, judged)) {
        return reply("Intake cancelled; nothing changed.", true);
      }
      const decision = sizingDecision(given, judged);
      const artifactNeed = judged?.ok ? judged.value.artifactNeed : {};
      const proposalFor = (size: Sizing) => proposeArtifacts(size, artifactNeed);
      const chosen = await chooseSize(ctx, decision, proposalFor);
      if ("stop" in chosen) return reply(chosen.stop, chosen.isError);
      const { sizing } = chosen;
      if (!sameWorkflow(initial, deps.state.get())) {
        return reply("Workflow changed while intake was waiting; run intake again.", true);
      }
      const before = deps.state.get();
      const keep = await declinedToReplace(ctx, before);
      if (!sameWorkflow(before, deps.state.get())) {
        return reply("Workflow changed while intake was waiting; run intake again.", true);
      }
      if (keep !== undefined) {
        const proposal = renderProposal({
          sizing,
          basis: decision.basis,
          proposal: proposalFor(sizing),
        });
        return reply(`${proposal}\n${keep}`);
      }
      const slice = uniqueSlice(sliceSlug(request), slicesInUse(before)) as SliceRef;
      deps.state.update((s) => ({
        ...s,
        phase: phaseFor(sizing),
        sizing,
        activeSlice: slice,
      }));
      const final = renderProposal({
        sizing,
        basis: decision.basis,
        proposal: proposalFor(sizing),
      });
      const note =
        sizing === "fix"
          ? "\nReview is NOT waived: this slice still needs its review rounds before commit."
          : "";
      return reply(`${final}\nPhase: ${phaseFor(sizing)}. Active slice: ${slice}.${note}`);
    },
  };
}

export function createIntakeTool(
  deps: Parameters<typeof buildIntakeTool>[0],
): ReturnType<typeof buildIntakeTool> {
  return withJevToolUsage(deps, buildIntakeTool);
}
