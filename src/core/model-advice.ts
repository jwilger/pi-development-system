import {
  type Available,
  flattenSlot,
  type ModelMatrix,
  matchesPattern,
  resolveSlot,
  type Slot,
} from "./models.ts";
import type { Phase } from "./types.ts";

/** Highest first. */
export const TIERS = ["frontier", "strong", "fast"] as const;
export type Tier = (typeof TIERS)[number];

const PHASE_SLOT: Partial<Record<Phase, Slot>> = {
  planning: "planning",
  implementing: "implementer",
  reviewing: "reviewer",
};

export const requiredSlot = (phase: Phase): Slot | undefined => PHASE_SLOT[phase];

const split = (ref: string): { provider: string; id: string } | undefined => {
  const slash = ref.indexOf("/");
  return slash <= 0 || slash === ref.length - 1
    ? undefined
    : { provider: ref.slice(0, slash), id: ref.slice(slash + 1) };
};

const matches = (candidates: readonly string[], model: string): boolean => {
  const ref = split(model);
  return (
    ref !== undefined &&
    candidates.some((candidate) => {
      const c = split(candidate);
      return c !== undefined && c.provider === ref.provider && matchesPattern(c.id, ref.id);
    })
  );
};

/**
 * The lowest tier whose candidates include `provider/id`: a model that appears as a fallback in a
 * higher tier (sol in frontier) still belongs to the tier it is natively listed in. Undefined when
 * the model is in none of them.
 */
export function tierOf(matrix: ModelMatrix, model: string): Tier | undefined {
  // Direct candidates only: `fast` falls back to `@strong`, which must not make strong models fast.
  return [...TIERS].reverse().find((tier) =>
    matches(
      matrix[tier].filter((c) => !c.startsWith("@")),
      model,
    ),
  );
}

export type AdviceInput = {
  matrix: ModelMatrix;
  available: readonly Available[];
  phase: Phase;
  /** The coordinator's current model as `provider/id`. */
  model: string;
};

/**
 * One recommendation when the coordinator's tier is below what the phase's slot resolves to; never
 * a model switch. Silent when the phase has no slot, the slot cannot be resolved here, or either
 * model is outside the three tiers (nothing to compare).
 */
export function adviseModel(input: AdviceInput): string | undefined {
  const slot = requiredSlot(input.phase);
  if (slot === undefined) return undefined;
  const wanted = resolveSlot(input.matrix, slot, input.available);
  if (!wanted.ok) return undefined;
  // Anything the slot itself lists is acceptable for the phase, whatever tier it natively sits in.
  if (matches(flattenSlot(input.matrix, slot), input.model)) return undefined;
  const have = tierOf(input.matrix, input.model);
  const need = tierOf(input.matrix, wanted.value.model);
  if (have === undefined || need === undefined) return undefined;
  if (TIERS.indexOf(have) <= TIERS.indexOf(need)) return undefined;
  return `${input.phase} on ${input.model} (${have} tier) — the matrix prefers ${wanted.value.model} (${need} tier) for the ${slot} slot. Consider asking an advisor subagent for the hard decisions, or continue and record a departure (gate models.phase-mismatch). The system never switches your model for you.`;
}
