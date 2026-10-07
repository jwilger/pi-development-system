import type { ReviewState } from "./review.ts";

/** Pure domain types for the development system. No I/O lives here. */

export type ParseError = { readonly kind: "parse-error"; readonly message: string };

export const parseError = (message: string): ParseError => ({ kind: "parse-error", message });

export const isParseError = (value: unknown): value is ParseError =>
  typeof value === "object" && value !== null && "kind" in value && value.kind === "parse-error";

export type Tier = "hard" | "soft" | "advisory";

export type GateId = string & { readonly __brand: "GateId" };

const GATE_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+(:[a-z0-9-]+)?$/;

/** Gate ids are dotted kebab-case, optionally qualified: `artifact.skipped:brief`. */
export function parseGateId(input: string): GateId | ParseError {
  return GATE_ID.test(input)
    ? (input as GateId)
    : parseError(`invalid gate id "${input}": expected dotted kebab-case like "git.force-push"`);
}

export type GateDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "block"; readonly reason: string }
  | { readonly kind: "require-departure"; readonly gate: GateId; readonly reason: string }
  | { readonly kind: "require-user"; readonly gate: GateId; readonly reason: string };

export type Phase = "intake" | "planning" | "implementing" | "reviewing" | "delivering" | "idle";

export type Sizing = "fix" | "change" | "capability" | "product";

export type SliceRef = string & { readonly __brand: "SliceRef" };

export type DepartureId = string & { readonly __brand: "DepartureId" };

export type DepartureScope =
  | { readonly kind: "slice"; readonly slice: SliceRef }
  | { readonly kind: "session" }
  | { readonly kind: "once"; readonly toolCallId: string };

/** A recorded departure from a default or non-negotiable (plan Appendix A). */
export type Departure = {
  readonly id: DepartureId;
  readonly gate: GateId;
  readonly tier: "soft" | "hard";
  readonly default: string;
  readonly chosen: string;
  readonly why: string;
  readonly costIfWrong: string;
  readonly approver: "agent" | "user";
  readonly scope: DepartureScope;
  readonly revisitWhen?: string;
  readonly recordedAt: string;
};

export type JevStatus = "online" | "offline" | "unknown";

export type CiStatusName = "green" | "red" | "pending" | "unknown";
export const CI_STATUSES: readonly CiStatusName[] = ["green", "red", "pending", "unknown"];

/** Last observed CI state of the trunk (see `/devsys-ci`). */
export type CiState = { readonly status: CiStatusName; readonly sha?: string };

/** Language profile: universal principles plus the idioms of one language (decision D3). */
export type Profile = "rust" | "typescript";

/** Last observed test-runner invocation (see src/state/test-evidence.ts). */
export type TestRun = {
  readonly at: string;
  readonly exitCode: number;
  readonly summary: string;
};

export type DevsysState = {
  readonly phase: Phase;
  readonly sizing?: Sizing;
  readonly activeSlice?: SliceRef;
  readonly openDepartures: ReadonlyArray<Departure>;
  readonly jev: JevStatus;
  readonly lastPushAt?: string;
  readonly ci?: CiState;
  readonly profiles?: ReadonlyArray<Profile>;
  readonly lastTestRun?: TestRun;
  /** One review record per slice (see src/core/review.ts). */
  readonly reviews?: ReadonlyArray<ReviewState>;
};

export const initialState = (): DevsysState => ({
  phase: "idle",
  openDepartures: [],
  jev: "unknown",
});
