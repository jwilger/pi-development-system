import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { parseDeparture, renderDepartureMarkdown } from "../core/departure.ts";
import { gateIds, lookupGate } from "../core/gates.ts";
import { redactSecrets } from "../core/redact.ts";
import { isParseError, parseGateId } from "../core/types.ts";
import { appendDecision } from "../state/decision-log.ts";
import type { SessionState } from "../state/session-state.ts";

export const DEPARTURE_ENTRY_TYPE = "devsys-departure";

const Parameters = Type.Object({
  gate: Type.String({ description: `Gate id. One of: ${gateIds().join(", ")}` }),
  chosen: Type.String({ description: "What you are doing instead of the default" }),
  why: Type.String({ description: "Why the default does not fit here" }),
  costIfWrong: Type.String({ description: "What goes wrong if this judgement is mistaken" }),
  scope: Type.Union([Type.Literal("slice"), Type.Literal("session"), Type.Literal("once")], {
    description: "How long the departure applies",
  }),
  revisitWhen: Type.Optional(Type.String({ description: "Condition that should reopen this" })),
});

export type RecordDepartureDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  now?: () => Date;
};

const fail = (text: string) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError: true,
});

function resolveScope(kind: "slice" | "session" | "once", toolCallId: string, slice?: string) {
  if (kind === "once") return { kind, toolCallId };
  if (kind === "session") return { kind };
  return slice !== undefined ? { kind, slice } : undefined;
}

/** `devsys_record_departure`: the sanctioned escape hatch for soft gates. */
export function createRecordDepartureTool(
  deps: RecordDepartureDeps,
): ToolDefinition<typeof Parameters> {
  const now = deps.now ?? (() => new Date());
  return {
    name: "devsys_record_departure",
    label: "Record departure",
    description:
      "Record a deliberate departure from a soft default before acting against it. " +
      "Hard stops (git history/force/no-verify) cannot be recorded here; use devsys_request_approval.",
    promptSnippet: "Record a departure from a development-system default (soft gates only)",
    parameters: Parameters,
    exposure: "direct",
    async execute(toolCallId, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const gate = parseGateId(params.gate);
      const info = isParseError(gate) ? undefined : lookupGate(gate);
      if (isParseError(gate) || info === undefined) {
        return fail(`Unknown gate "${params.gate}". Registered gates: ${gateIds().join(", ")}`);
      }
      if (info.tier === "hard") {
        return fail(
          `Gate ${gate} is a hard stop: it needs the user. Call devsys_request_approval with the command and your reason.`,
        );
      }
      const current = deps.state.get();
      const scope = resolveScope(params.scope, toolCallId, current.activeSlice);
      if (scope === undefined) {
        return fail('scope "slice" needs an active slice; use "session" or "once" instead.');
      }
      const recordedAt = now();
      const departure = parseDeparture({
        id: `dep-${recordedAt.getTime()}-${toolCallId}`,
        gate,
        tier: info.tier,
        default: info.default,
        chosen: redactSecrets(params.chosen),
        why: redactSecrets(params.why),
        costIfWrong: redactSecrets(params.costIfWrong),
        approver: "agent",
        scope,
        ...(params.revisitWhen !== undefined
          ? { revisitWhen: redactSecrets(params.revisitWhen) }
          : {}),
        recordedAt: recordedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
      });
      if (isParseError(departure)) return fail(departure.message);
      const { path } = await appendDecision(ctx.cwd, departure, recordedAt);
      deps.pi.appendEntry(DEPARTURE_ENTRY_TYPE, departure);
      deps.state.update((s) => ({ ...s, openDepartures: [...s.openDepartures, departure] }));
      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded in ${path}:\n\n${renderDepartureMarkdown(departure)}`,
          },
        ],
        details: undefined,
      };
    },
  };
}
