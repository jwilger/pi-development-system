import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { parseSizing } from "../core/sizing.ts";
import { type DevsysState, isParseError, type Sizing, type SliceRef } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeSizing } from "../jev/questions/sizing.ts";
import type { SessionState } from "../state/session-state.ts";
import { phaseFor, proposeArtifacts, renderProposal, sliceSlug, uniqueSlice } from "./intake.ts";

const Parameters = Type.Object({
  request: Type.String({ description: "What the user asked for, in their words." }),
  repoSummary: Type.Optional(
    Type.String({ description: "One or two sentences on the repository, if known." }),
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

/** `devsys_intake`: Jev proposes a size and artifact set; the user confirms; state moves to the first phase. */
export function createIntakeTool(deps: {
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
}): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_intake",
    label: "Start work",
    description:
      "Size a request (fix, change, capability, product) and list the planning artifacts that size needs. " +
      "The user confirms the size; then phase, sizing and the active slice are set. Call at the start of any non-trivial work.",
    promptSnippet: "Size new work and propose the planning artifacts it needs",
    parameters: Parameters,
    exposure: "direct",
    async execute(_id, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const request = params.request.trim();
      if (request === "") return reply("request must not be empty", true);
      const judged = await judgeSizing(deps.jev(ctx), {
        request,
        repoSummary: params.repoSummary ?? "",
      });
      const proposedSize: Sizing = judged.ok ? judged.value.sizing : "change";
      const basis = judged.ok
        ? `Jev judged ${judged.value.sizing} (confidence ${judged.value.confidence.toFixed(2)}).`
        : `Jev unavailable (${judged.error.kind}); defaulted to change.`;
      const artifactNeed = judged.ok ? judged.value.artifactNeed : {};
      const proposalFor = (size: Sizing) => proposeArtifacts(size, artifactNeed);
      const proposal = renderProposal({
        sizing: proposedSize,
        basis,
        proposal: proposalFor(proposedSize),
      });
      if (!ctx.hasUI) return reply(`${proposal}\nHeadless: proposal only, not applied.`);
      const picked = await ctx.ui.select(`Size this work (${basis})`, sizeChoices(proposedSize));
      if (picked === undefined) return reply(`${proposal}\nIntake cancelled; nothing changed.`);
      const sizing = parseSizing(picked);
      if (isParseError(sizing)) return reply(sizing.message, true);
      const slice = uniqueSlice(sliceSlug(request), slicesInUse(deps.state.get())) as SliceRef;
      deps.state.update((s) => ({
        ...s,
        phase: phaseFor(sizing),
        sizing,
        activeSlice: slice,
      }));
      const final = renderProposal({ sizing, basis, proposal: proposalFor(sizing) });
      return reply(`${final}\nPhase: ${phaseFor(sizing)}. Active slice: ${slice}.`);
    },
  };
}
