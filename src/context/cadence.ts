export const DEFAULT_PUSH_MINUTES = 60;

import type { DevsysState } from "../core/types.ts";

/** Width of the buckets the elapsed time is reported in, so the line changes rarely. */
const CADENCE_BUCKET_MINUTES = 30;

/**
 * Advisory only: a long gap since the last push while implementing hints the increment is too big.
 * The minutes are rounded down to a bucket so the text stays the same across many turns.
 */
export function cadenceLine(
  state: DevsysState,
  now: number,
  pushMinutes: number,
): string | undefined {
  if (state.phase !== "implementing" || state.lastPushAt === undefined) return undefined;
  const pushed = Date.parse(state.lastPushAt);
  if (!Number.isFinite(pushed)) return undefined;
  const minutes = Math.floor((now - pushed) / 60_000);
  if (minutes <= pushMinutes) return undefined;
  const bucket = Math.max(
    pushMinutes,
    Math.floor(minutes / CADENCE_BUCKET_MINUTES) * CADENCE_BUCKET_MINUTES,
  );
  return `⚠ over ${bucket} min since last push — is this increment too big?`;
}
