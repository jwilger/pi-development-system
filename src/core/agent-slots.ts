import {
  type Available,
  defaultMatrix,
  type ModelMatrix,
  resolveSlot,
  type Slot,
} from "./models.ts";

const SLOT_OF: Readonly<Record<string, Slot>> = {
  reviewer: "reviewer",
  implementer: "implementer",
  coder: "implementer",
  researcher: "researcher",
  advisor: "advisor",
  architect: "planning",
  tasker: "planning",
};

/** The model slot whose job an agent type does; undefined for a type the matrix has no opinion on. */
export function slotForAgentType(type: string): Slot | undefined {
  if (type.startsWith("lens-")) return "lens";
  return SLOT_OF[type];
}

/**
 * The model an `agent_spawn` without a `model` should get from the project's `[models]`: the agent
 * type's slot, when the project configured it and it resolves. A slot left at the shipped default is
 * not forced, so the agent type's own `models:` list (and any user override of it) still applies. With an
 * `estimate` (tokens), models whose context window cannot fit it are skipped (ADR 0009).
 */
export function spawnModelFor(
  type: string,
  matrix: ModelMatrix,
  available: readonly Available[],
  estimate?: number,
): string | undefined {
  const slot = slotForAgentType(type);
  if (slot === undefined) return undefined;
  const resolved = resolveSlot(matrix, slot, available, estimate);
  if (!resolved.ok) return undefined;
  // Compared by outcome, not by list: a slot that defaults to a tier pointer changes when its tier does.
  const shipped = resolveSlot(defaultMatrix(), slot, available, estimate);
  return shipped.ok && shipped.value.model === resolved.value.model
    ? undefined
    : resolved.value.model;
}
