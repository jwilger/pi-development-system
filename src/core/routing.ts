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

const FALLBACK: Route = { slot: "implementer", thinkingLevel: "medium" };

/** Route → slot → a concrete model among those this machine can use. Pure. */
export function recommendRoute(input: {
  readonly routing: RoutingTable;
  readonly matrix: ModelMatrix;
  readonly available: readonly Available[];
  readonly difficulty: Difficulty;
  readonly risk: RiskLevel;
}): Recommendation {
  const picked = pickRoute(input.routing, input.difficulty, input.risk);
  const route = picked ?? FALLBACK;
  const prefix =
    picked === undefined ? "No routing entry matched; using the implementer slot. " : "";
  const resolved = resolveSlot(input.matrix, route.slot, input.available);
  if (!resolved.ok) {
    return {
      ...route,
      note: `${prefix}No model with credentials resolves slot "${route.slot}" (unresolvable); an agent spawned without a pin usually fails the same way (its models: list defaults to the same candidates), so run /devsys-models to fix the matrix or pin a model you know works.`,
    };
  }
  return {
    ...route,
    model: resolved.value.model,
    via: resolved.value.via,
    note: `${prefix}Slot "${route.slot}" resolves to ${resolved.value.model} (via ${resolved.value.via}).`,
  };
}
