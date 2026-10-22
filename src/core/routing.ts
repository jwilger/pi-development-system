import { FIT_RATIO } from "./context-fit.ts";
import {
  type Available,
  type ModelMatrix,
  type ModelRef,
  resolveSlot,
  type Slot,
} from "./models.ts";
import type { ThinkingLevel } from "./spawn-overrides.ts";

export type Difficulty = "trivial" | "routine" | "complex" | "expert";
export type RiskLevel = "low" | "medium" | "high";
export const DIFFICULTIES: readonly Difficulty[] = ["trivial", "routine", "complex", "expert"];
export const RISKS: readonly RiskLevel[] = ["low", "medium", "high"];

export type Route = { readonly slot: Slot; readonly thinkingLevel: ThinkingLevel };
export type RoutingTable = Readonly<Record<string, Route>>;

// Most specific entry wins: exact `d/r`, then `d/*`, then `*` + `/r`, then `*` + `/*` (wildcards).
export function pickRoute(
  routing: RoutingTable,
  difficulty: Difficulty,
  risk: RiskLevel,
): Route | undefined {
  for (const key of [`${difficulty}/${risk}`, `${difficulty}/*`, `*/${risk}`, "*/*"]) {
    const hit = routing[key];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export type Recommendation = {
  readonly slot: Slot;
  readonly thinkingLevel: ThinkingLevel;
  /** Absent when the slot resolves to nothing usable; the agent type's own defaults then apply. */
  readonly model?: ModelRef;
  readonly via?: string;
  readonly note: string;
};

/** `provider/id (N-token window)`, or the bare ref when the window is unknown. */
function windowed(available: readonly Available[], ref: string): string {
  const window = available.find((m) => `${m.provider}/${m.id}` === ref)?.contextWindow;
  return window === undefined ? ref : `${ref} (${window}-token window)`;
}

/** Why smaller-window models were passed over, or nothing when none were. */
function skippedNote(
  available: readonly Available[],
  skipped: readonly ModelRef[] | undefined,
  estimate: number | undefined,
): string {
  if (skipped === undefined || skipped.length === 0 || estimate === undefined) return "";
  const named = skipped.map((ref) => windowed(available, ref));
  return ` Context: skipped ${named.join(", ")}; the request is ~${estimate} tokens, more than ${Math.round(FIT_RATIO * 100)}% of their window.`;
}

const FALLBACK: Route = { slot: "implementer", thinkingLevel: "medium" };

/** Route → slot → a concrete model among those this machine can use. Pure. */
export function recommendRoute(input: {
  readonly routing: RoutingTable;
  readonly matrix: ModelMatrix;
  readonly available: readonly Available[];
  readonly difficulty: Difficulty;
  readonly risk: RiskLevel;
  /** Estimated request size in tokens; models too small for it are skipped (ADR 0009). */
  readonly estimate?: number;
}): Recommendation {
  const picked = pickRoute(input.routing, input.difficulty, input.risk);
  const route = picked ?? FALLBACK;
  const prefix =
    picked === undefined ? "No routing entry matched; using the implementer slot. " : "";
  const resolved = resolveSlot(input.matrix, route.slot, input.available, input.estimate);
  if (!resolved.ok) {
    const unsized =
      input.estimate === undefined
        ? resolved
        : resolveSlot(input.matrix, route.slot, input.available);
    if (unsized.ok && input.estimate !== undefined) {
      return {
        ...route,
        note: `${prefix}Every model in slot "${route.slot}" is too small for this request: it would resolve to ${windowed(input.available, unsized.value.model)}, but the request is ~${input.estimate} tokens, more than ${Math.round(FIT_RATIO * 100)}% of its window. Add a larger model to the slot or pin one.`,
      };
    }
    return {
      ...route,
      note: `${prefix}No model with credentials resolves slot "${route.slot}" (unresolvable); an agent spawned without a pin usually fails the same way (its models: list defaults to the same candidates), so run /devsys-models to fix the matrix or pin a model you know works.`,
    };
  }
  return {
    ...route,
    model: resolved.value.model,
    via: resolved.value.via,
    note: `${prefix}Slot "${route.slot}" resolves to ${resolved.value.model} (via ${resolved.value.via}).${skippedNote(input.available, resolved.value.skipped, input.estimate)}`,
  };
}
