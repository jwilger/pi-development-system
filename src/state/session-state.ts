import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseDeparture } from "../core/departure.ts";
import {
  CI_STATUSES,
  type CiState,
  type CiStatusName,
  type Departure,
  type DevsysState,
  initialState,
  isParseError,
  type JevStatus,
  type ParseError,
  type Phase,
  type Profile,
  parseError,
  type Sizing,
  type SliceRef,
  type TestRun,
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
const PROFILE_NAMES: ReadonlyArray<Profile> = ["rust", "typescript"];
const SIZINGS: ReadonlyArray<Sizing> = ["fix", "change", "capability", "product"];
const JEV: ReadonlyArray<JevStatus> = ["online", "offline", "unknown"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseCi(input: unknown): CiState | ParseError {
  if (!isRecord(input)) return parseError("ci must be an object");
  const { status, sha } = input;
  if (!CI_STATUSES.includes(status as CiStatusName)) {
    return parseError(`unknown ci status: ${String(status)}`);
  }
  if (sha !== undefined && typeof sha !== "string") return parseError("ci.sha must be a string");
  return { status: status as CiStatusName, ...(sha !== undefined ? { sha } : {}) };
}

function parseProfileList(input: unknown): Profile[] | ParseError {
  if (!Array.isArray(input)) return parseError("profiles must be an array");
  const out: Profile[] = [];
  for (const name of input) {
    if (!PROFILE_NAMES.includes(name as Profile))
      return parseError(`unknown profile: ${String(name)}`);
    out.push(name as Profile);
  }
  return out;
}

function parseTestRun(input: unknown): TestRun | ParseError {
  if (!isRecord(input)) return parseError("lastTestRun must be an object");
  const { at, exitCode, summary } = input;
  if (typeof at !== "string" || typeof exitCode !== "number" || typeof summary !== "string") {
    return parseError("lastTestRun needs string at, number exitCode and string summary");
  }
  return { at, exitCode, summary };
}

/** Boundary parse for persisted state: the only place state is cast from `unknown`. */
export function parseDevsysState(input: unknown): DevsysState | ParseError {
  if (!isRecord(input)) return parseError("devsys state must be an object");
  const { phase, sizing, activeSlice, openDepartures, jev, lastPushAt, ci, profiles, lastTestRun } =
    input;
  if (!PHASES.includes(phase as Phase)) return parseError(`unknown phase: ${String(phase)}`);
  if (!JEV.includes(jev as JevStatus)) return parseError(`unknown jev status: ${String(jev)}`);
  if (!Array.isArray(openDepartures)) return parseError("openDepartures must be an array");
  const departures: Departure[] = [];
  for (const raw of openDepartures) {
    const departure = parseDeparture(raw);
    if (isParseError(departure)) return departure;
    departures.push(departure);
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
  const parsedCi = ci === undefined ? undefined : parseCi(ci);
  if (isParseError(parsedCi)) return parsedCi;
  const parsedProfiles = profiles === undefined ? undefined : parseProfileList(profiles);
  if (isParseError(parsedProfiles)) return parsedProfiles;
  const parsedRun = lastTestRun === undefined ? undefined : parseTestRun(lastTestRun);
  if (isParseError(parsedRun)) return parsedRun;
  return {
    phase: phase as Phase,
    jev: jev as JevStatus,
    openDepartures: departures,
    ...(sizing !== undefined ? { sizing: sizing as Sizing } : {}),
    ...(activeSlice !== undefined ? { activeSlice: activeSlice as SliceRef } : {}),
    ...(lastPushAt !== undefined ? { lastPushAt } : {}),
    ...(parsedCi !== undefined ? { ci: parsedCi } : {}),
    ...(parsedProfiles !== undefined ? { profiles: parsedProfiles } : {}),
    ...(parsedRun !== undefined ? { lastTestRun: parsedRun } : {}),
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
