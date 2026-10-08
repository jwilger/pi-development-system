import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { parseDeparture } from "../core/departure.ts";
import { lookupGate } from "../core/gates.ts";
import { parseSizing } from "../core/sizing.ts";
import { type DevsysState, isParseError, type Sizing, type SliceRef } from "../core/types.ts";
import { DEPARTURE_ENTRY_TYPE } from "../gates/record-departure-tool.ts";
import type { Jev } from "../jev/client.ts";
import { judgeSizing } from "../jev/questions/sizing.ts";
import { appendDecision } from "../state/decision-log.ts";
import type { SessionState } from "../state/session-state.ts";
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

/** The waiver is its own question, naming the request and what the review gate actually covers. */
const askToWaiveReview = (
  ctx: ExtensionContext,
  request: string,
  slice: SliceRef,
): Promise<boolean> =>
  ctx.ui.confirm(
    "Skip fresh-context review for this fix?",
    `"${request.slice(0, 120)}"\nThe review gate checks the whole uncommitted diff, so yes waives review for everything committed under slice "${slice}". The waiver is logged in docs/decisions.`,
  );

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

const waiverNote = (sizing: Sizing, departed: string | undefined): string => {
  if (departed !== undefined)
    return `\nRecorded in ${departed}: you waived fresh-context review for this fix.`;
  return sizing === "fix"
    ? "\nReview is NOT waived: this slice still needs its review rounds before commit."
    : "";
};

/**
 * I8.1 sizes a fix without a review artifact, but the commit gate reviews every slice (I6.4). Only the user's
 * explicit yes to the waiver question is recorded, as a user-approved departure for this slice alone.
 */
async function fixWithoutReview(
  deps: { pi: ExtensionAPI; state: SessionState },
  ctx: ExtensionContext,
  slice: SliceRef,
): Promise<string | undefined> {
  const info = lookupGate("review.unsatisfied");
  const at = new Date();
  const departure = parseDeparture({
    id: `dep-${at.getTime()}-intake`,
    gate: "review.unsatisfied",
    tier: "soft",
    default: info?.default ?? "finish the fresh-context review before release",
    chosen: "no review rounds for this slice",
    why: "the user was asked and agreed: this is a fix, which the sizing table plans without a review artifact",
    costIfWrong: "a defect in a small change ships without a fresh-context look",
    approver: "user",
    scope: { kind: "slice", slice },
    revisitWhen: "the fix turns out to touch more than its task record named",
    recordedAt: at.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
  if (isParseError(departure)) return undefined;
  const { path } = await appendDecision(ctx.cwd, departure, at);
  deps.pi.appendEntry(DEPARTURE_ENTRY_TYPE, departure);
  deps.state.update((s) => ({ ...s, openDepartures: [...s.openDepartures, departure] }));
  return path;
}

/** `devsys_intake`: Jev (or the caller) sizes the work; only a doubtful Jev asks the user; state moves to the first phase. */
export function createIntakeTool(deps: {
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
    async execute(_id, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const request = params.request.trim();
      if (request === "") return reply("request must not be empty", true);
      const given = params.size === undefined ? undefined : parseSizing(params.size.trim());
      if (given !== undefined && isParseError(given)) return reply(given.message, true);
      const judged =
        given === undefined
          ? await judgeSizing(deps.jev(ctx), { request, repoSummary: params.repoSummary ?? "" })
          : undefined;
      const decision = decideSize(
        given,
        judged?.ok ? judged.value : undefined,
        judged?.ok === false ? judged.error.kind : "not asked",
      );
      const artifactNeed = judged?.ok ? judged.value.artifactNeed : {};
      const proposalFor = (size: Sizing) => proposeArtifacts(size, artifactNeed);
      const chosen = await chooseSize(ctx, decision, proposalFor);
      if ("stop" in chosen) return reply(chosen.stop, chosen.isError);
      const { sizing } = chosen;
      const before = deps.state.get();
      const keep = await declinedToReplace(ctx, before);
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
      const waived =
        sizing === "fix" && ctx.hasUI ? await askToWaiveReview(ctx, request, slice) : false;
      const departed = waived ? await fixWithoutReview(deps, ctx, slice) : undefined;
      const final = renderProposal({
        sizing,
        basis: decision.basis,
        proposal: proposalFor(sizing),
      });
      const note = waiverNote(sizing, departed);
      return reply(`${final}\nPhase: ${phaseFor(sizing)}. Active slice: ${slice}.${note}`);
    },
  };
}
