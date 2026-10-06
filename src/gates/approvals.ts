import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Departure, parseDeparture } from "../core/departure.ts";
import { lookupGate } from "../core/gates.ts";
import { type GateId, isParseError } from "../core/types.ts";
import { appendDecision } from "../state/decision-log.ts";
import { DEPARTURE_ENTRY_TYPE } from "./record-departure-tool.ts";

export const APPROVAL_ENTRY_TYPE = "devsys-approval";

type Approval = { id: string; gate: string; command: string; used: boolean };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Pre-granted, single-use approvals for an exact (gate, command) pair, persisted as session entries. */
export type ApprovalStore = {
  grant(gate: string, command: string, id: string): void;
  /** True (and marks the approval used) when an unused approval exists for this exact pair. */
  consume(gate: string, command: string): boolean;
  rebuildFrom(entries: ReadonlyArray<{ customType: string; data: unknown }>): void;
};

export function createApprovalStore(pi: ExtensionAPI): ApprovalStore {
  let approvals: Approval[] = [];
  const persist = (a: Approval) => pi.appendEntry(APPROVAL_ENTRY_TYPE, a);
  return {
    grant(gate, command, id) {
      const approval = { id, gate, command: command.trim(), used: false };
      approvals.push(approval);
      persist(approval);
    },
    consume(gate, command) {
      const found = approvals.find(
        (a) => !a.used && a.gate === gate && a.command === command.trim(),
      );
      if (found === undefined) return false;
      found.used = true;
      persist(found);
      return true;
    },
    rebuildFrom(entries) {
      const byId = new Map<string, Approval>();
      for (const e of entries) {
        if (e.customType !== APPROVAL_ENTRY_TYPE || !isRecord(e.data)) continue;
        const { id, gate, command, used } = e.data;
        if (
          typeof id === "string" &&
          typeof gate === "string" &&
          typeof command === "string" &&
          typeof used === "boolean"
        ) {
          byId.set(id, { id, gate, command, used });
        }
      }
      approvals = [...byId.values()];
    },
  };
}

export type HardStopRequest = {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  gate: GateId;
  command: string;
  why: string;
  toolCallId: string;
  now?: () => Date;
};

export type HardStopOutcome =
  | { kind: "approved"; departure: Departure }
  | { kind: "declined" }
  | { kind: "unavailable" };

/** Asks the user to approve one irreversible action; on approval records it (hard · user · once). */
export async function requestHardStop(req: HardStopRequest): Promise<HardStopOutcome> {
  if (!req.ctx.hasUI) return { kind: "unavailable" };
  const approved = await req.ctx.ui.confirm(
    "Development system — hard stop",
    `${req.command}\nGate: ${req.gate}\nThis is irreversible. Approve once?`,
  );
  if (!approved) return { kind: "declined" };
  const at = (req.now ?? (() => new Date()))();
  const departure = parseDeparture({
    id: `dep-${at.getTime()}-${req.toolCallId}`,
    gate: req.gate,
    tier: "hard",
    default: lookupGate(req.gate)?.default ?? "hard stop",
    chosen: req.command,
    why: req.why,
    costIfWrong: "an irreversible git operation is performed",
    approver: "user",
    scope: { kind: "once", toolCallId: req.toolCallId },
    recordedAt: at.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
  if (isParseError(departure)) throw new Error(departure.message);
  await appendDecision(req.ctx.cwd, departure, at);
  req.pi.appendEntry(DEPARTURE_ENTRY_TYPE, departure);
  return { kind: "approved", departure };
}
