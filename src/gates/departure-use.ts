import type { GateId } from "../core/types.ts";
import type { SessionState } from "../state/session-state.ts";

/** Open recorded departures for one soft gate: whether one applies now, and spending a once-scoped one. */
export type DepartureUse = { hasOpen(): boolean; consume(): void };

export function departureUse(state: SessionState, gate: GateId): DepartureUse {
  const applicable = () => {
    const { openDepartures, activeSlice } = state.get();
    return openDepartures.filter(
      (d) => d.gate === gate && (d.scope.kind !== "slice" || d.scope.slice === activeSlice),
    );
  };
  return {
    hasOpen: () => applicable().length > 0,
    consume() {
      const open = applicable();
      // A broader departure covers the call without being spent; only a lone once-scoped one is used up.
      if (open.some((d) => d.scope.kind !== "once")) return;
      const used = open[0];
      if (used === undefined) return;
      state.update((s) => ({
        ...s,
        openDepartures: s.openDepartures.filter((d) => d.id !== used.id),
      }));
    },
  };
}
