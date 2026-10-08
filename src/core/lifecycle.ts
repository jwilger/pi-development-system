import type { ReviewAction } from "./review.ts";
import type { DevsysState, SliceRef } from "./types.ts";

/**
 * How a slice moves through the phases once it is implementing. Pure: the tools and guards that observe the
 * events (a review round, an edit, a push) call these and write the result to state.
 *
 *   implementing → reviewing   a review round starts or is recorded without being satisfied
 *   reviewing    → delivering  the review is satisfied on the current diff
 *   delivering   → reviewing   a later round finds something again
 *   delivering   → implementing  production source is edited (the review no longer covers it)
 *   any open     → idle        the slice is delivered or abandoned (`closeSlice`)
 */

const IN_FLIGHT = new Set<DevsysState["phase"]>(["implementing", "reviewing", "delivering"]);

/** The state after a review round was started or recorded; `action` is `nextAction` for the diff as it is now. */
export function afterReviewRound(
  state: DevsysState,
  action: ReviewAction,
  slice: SliceRef | undefined = state.activeSlice,
): DevsysState {
  if (state.activeSlice === undefined || slice !== state.activeSlice) return state;
  if (!IN_FLIGHT.has(state.phase)) return state;
  return { ...state, phase: action === "done" ? "delivering" : "reviewing" };
}

/** Editing production source after review reopens the slice, so red-first applies to the edit again. */
export const afterSourceEdit = (state: DevsysState): DevsysState =>
  state.phase === "delivering" ? { ...state, phase: "implementing" } : state;

/** Back to idle: the slice, its sizing and its slice-scoped departures are done. Review history is kept. */
export function closeSlice(state: DevsysState): DevsysState {
  const { activeSlice, sizing: _sizing, ...rest } = state;
  return {
    ...rest,
    phase: "idle",
    openDepartures: state.openDepartures.filter(
      (d) => d.scope.kind !== "slice" || d.scope.slice !== activeSlice,
    ),
  };
}

/** A recorded `review.unsatisfied` departure covers this slice, so no review is owed before it ships. */
export const reviewWaived = (state: DevsysState): boolean =>
  state.openDepartures.some(
    (d) =>
      d.gate === "review.unsatisfied" &&
      (d.scope.kind === "session" ||
        (d.scope.kind === "slice" && d.scope.slice === state.activeSlice)),
  );
