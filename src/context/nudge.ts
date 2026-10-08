import type { DevsysState } from "../core/types.ts";
import { cadenceLine } from "./cadence.ts";

export const NUDGE_ENTRY_TYPE = "devsys-nudge";

/**
 * Pure: the one-shot message for a run, or undefined when there is nothing to say.
 *
 * Why a message and not the system prompt or the context: pi persists the message returned from
 * `before_agent_start` right after the user prompt, so it becomes part of the stable prefix the
 * provider caches. A per-call context edit sits on the cache breakpoint and is never persisted,
 * which made every request a cache miss. A system-prompt edit is resent in full to the model.
 *
 * `last` is the previous cadence text already in the conversation; the same text is not repeated.
 */
export function renderNudge(
  state: DevsysState,
  now: number,
  pushMinutes: number,
  intentLine: string | undefined,
  lastCadence: string | undefined,
): { text: string; cadence: string | undefined } | undefined {
  const cadence = cadenceLine(state, now, pushMinutes);
  const lines = [
    ...(intentLine === undefined ? [] : [intentLine]),
    ...(cadence === undefined || cadence === lastCadence ? [] : [cadence]),
  ];
  if (lines.length === 0) return undefined;
  return { text: ["[development-system]", ...lines].join("\n"), cadence: cadence ?? lastCadence };
}
