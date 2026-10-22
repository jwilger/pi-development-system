import type { DevsysState } from "../core/types.ts";

/** Only workflow identity: CI, tests and Jev availability can change independently. */
export function sameWorkflow(before: DevsysState, after: DevsysState): boolean {
  return (
    before.activeSlice === after.activeSlice &&
    before.phase === after.phase &&
    before.sizing === after.sizing
  );
}
