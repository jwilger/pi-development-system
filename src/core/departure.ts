import {
  type Departure,
  type DepartureId,
  type DepartureScope,
  type GateId,
  isParseError,
  type ParseError,
  parseError,
  parseGateId,
  type SliceRef,
} from "./types.ts";

export type { Departure } from "./types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseScope(input: unknown): DepartureScope | ParseError {
  if (!isRecord(input)) return parseError("scope must be an object");
  const { kind, slice, toolCallId } = input;
  if (kind === "session") return { kind: "session" };
  if (kind === "slice" && typeof slice === "string") {
    return { kind: "slice", slice: slice as SliceRef };
  }
  if (kind === "once" && typeof toolCallId === "string") return { kind: "once", toolCallId };
  return parseError(`invalid scope: ${JSON.stringify(input)}`);
}

const TEXT_FIELDS = ["id", "default", "chosen", "why", "costIfWrong", "recordedAt"] as const;

/** Boundary parse for a Departure (persisted entries, tool input). */
export function parseDeparture(input: unknown): Departure | ParseError {
  if (!isRecord(input)) return parseError("departure must be an object");
  for (const field of TEXT_FIELDS) {
    if (typeof input[field] !== "string") return parseError(`departure.${field} must be a string`);
  }
  const { id, gate: rawGate, tier, approver, revisitWhen } = input;
  const gate = parseGateId(String(rawGate));
  if (isParseError(gate)) return gate;
  if (tier !== "soft" && tier !== "hard") return parseError(`departure.tier invalid: ${tier}`);
  if (approver !== "agent" && approver !== "user") {
    return parseError(`departure.approver invalid: ${approver}`);
  }
  if (revisitWhen !== undefined && typeof revisitWhen !== "string") {
    return parseError("departure.revisitWhen must be a string");
  }
  const scope = parseScope(input.scope);
  if (isParseError(scope)) return scope;
  return {
    id: id as DepartureId,
    gate,
    tier,
    default: String(input.default),
    chosen: String(input.chosen),
    why: String(input.why),
    costIfWrong: String(input.costIfWrong),
    approver,
    scope,
    ...(revisitWhen !== undefined ? { revisitWhen } : {}),
    recordedAt: String(input.recordedAt),
  };
}

function renderScope(scope: DepartureScope): string {
  switch (scope.kind) {
    case "slice":
      return `slice \`${scope.slice}\``;
    case "session":
      return "session";
    case "once":
      return `once (${scope.toolCallId})`;
  }
}

/** Decision-log entry (plan Appendix A). Ends with a newline. */
export function renderDepartureMarkdown(d: Departure): string {
  const revisit = d.revisitWhen !== undefined ? ` · **Revisit when:** ${d.revisitWhen}` : "";
  return [
    `### ${d.recordedAt} · ${d.gate} · ${d.tier} · ${d.approver}`,
    `- **Default:** ${d.default}`,
    `- **Chosen:** ${d.chosen}`,
    `- **Why:** ${d.why}`,
    `- **Cost if wrong:** ${d.costIfWrong}`,
    `- **Scope:** ${renderScope(d.scope)}${revisit}`,
    "",
  ].join("\n");
}

/** The first departure recorded for `gate` at or before `now` (ISO-8601 UTC strings compare lexically). */
export function matchesPending(
  departures: ReadonlyArray<Departure>,
  gate: GateId,
  now: string,
): Departure | undefined {
  return departures.find((d) => d.gate === gate && d.recordedAt <= now);
}
