export const DEFAULT_PUSH_MINUTES = 60;

import type { DevsysState } from "../core/types.ts";

/** Advisory only: a long gap since the last push while implementing hints the increment is too big. */
export function cadenceLine(
  state: DevsysState,
  now: number,
  pushMinutes: number,
): string | undefined {
  if (state.phase !== "implementing" || state.lastPushAt === undefined) return undefined;
  const pushed = Date.parse(state.lastPushAt);
  if (!Number.isFinite(pushed)) return undefined;
  const minutes = Math.floor((now - pushed) / 60_000);
  return minutes > pushMinutes
    ? `⚠ ${minutes} min since last push — is this increment too big?`
    : undefined;
}
