import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type Departure,
  type DevsysState,
  initialState,
  isParseError,
  type JevStatus,
  type ParseError,
  type Phase,
  parseError,
  type Sizing,
  type SliceRef,
} from "../core/types.ts";

export const STATE_ENTRY_TYPE = "devsys-state";

const PHASES: ReadonlyArray<Phase> = [
  "intake",
  "planning",
  "implementing",
  "reviewing",
  "delivering",
  "idle",
];
const SIZINGS: ReadonlyArray<Sizing> = ["fix", "change", "capability", "product"];
const JEV: ReadonlyArray<JevStatus> = ["online", "offline", "unknown"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Boundary parse for persisted state: the only place state is cast from `unknown`. */
export function parseDevsysState(input: unknown): DevsysState | ParseError {
  if (!isRecord(input)) return parseError("devsys state must be an object");
  const { phase, sizing, activeSlice, openDepartures, jev, lastPushAt } = input;
  if (!PHASES.includes(phase as Phase)) return parseError(`unknown phase: ${String(phase)}`);
  if (!JEV.includes(jev as JevStatus)) return parseError(`unknown jev status: ${String(jev)}`);
  if (!Array.isArray(openDepartures) || !openDepartures.every(isRecord)) {
    return parseError("openDepartures must be an array of objects");
  }
  if (sizing !== undefined && !SIZINGS.includes(sizing as Sizing)) {
    return parseError(`unknown sizing: ${String(sizing)}`);
  }
  if (activeSlice !== undefined && typeof activeSlice !== "string") {
    return parseError("activeSlice must be a string");
  }
  if (lastPushAt !== undefined && typeof lastPushAt !== "string") {
    return parseError("lastPushAt must be a string");
  }
  return {
    phase: phase as Phase,
    jev: jev as JevStatus,
    openDepartures: openDepartures as Departure[],
    ...(sizing !== undefined ? { sizing: sizing as Sizing } : {}),
    ...(activeSlice !== undefined ? { activeSlice: activeSlice as SliceRef } : {}),
    ...(lastPushAt !== undefined ? { lastPushAt } : {}),
  };
}

export type SessionState = {
  get(): DevsysState;
  update(fn: (s: DevsysState) => DevsysState): void;
  rebuildFrom(entries: ReadonlyArray<{ customType: string; data: unknown }>): void;
  /** Registers a listener run after every update(); returns an unsubscribe function. */
  onChange(listener: (state: DevsysState) => void): () => void;
};

/**
 * In-session authority for development-system state. Every update appends the
 * full (small) state as a custom entry; on rebuild the last valid entry wins.
 */
export function createSessionState(api: ExtensionAPI): SessionState {
  let current: DevsysState = initialState();
  const listeners = new Set<(state: DevsysState) => void>();
  return {
    get: () => current,
    update(fn) {
      current = fn(current);
      api.appendEntry(STATE_ENTRY_TYPE, current);
      for (const listener of listeners) listener(current);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    rebuildFrom(entries) {
      let rebuilt: DevsysState = initialState();
      for (const entry of entries) {
        if (entry.customType !== STATE_ENTRY_TYPE) continue;
        const parsed = parseDevsysState(entry.data);
        if (!isParseError(parsed)) rebuilt = parsed;
      }
      current = rebuilt;
    },
  };
}
