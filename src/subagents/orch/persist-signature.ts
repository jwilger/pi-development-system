import type { SavedThread } from "../types.ts";

const LIVE = new Set(["starting", "running"]);

/**
 * What decides whether the registry needs writing again.
 *
 * pi appends every `appendEntry` to the session file and never rewrites it, and each
 * registry entry holds every thread (hundreds of kilobytes once a session has dozens).
 * A running thread changes on every turn: its status line, partial output, session leaf
 * id and token totals. Signing those wrote a snapshot per tool call: one session
 * reached 2.3 GB, a second 2.0 GB after only the status and output were excluded, and
 * pi ran out of memory loading them. None of it is needed to restore a live thread (a
 * reload marks it interrupted and resumes its session file at the latest leaf), so the
 * signature of a live thread is its identity, task and state only. Starting, settling,
 * pausing and adding or removing a thread still write, and a settled thread's leaf,
 * output and totals are signed in full.
 */
export function registrySignature(threads: readonly SavedThread[]): string {
  return JSON.stringify(
    threads.map((thread) => {
      if (!LIVE.has(thread.view.state)) return thread;
      const {
        status,
        output,
        error,
        sessionLeafId,
        inputTokens,
        outputTokens,
        elapsedMs,
        ...stable
      } = thread.view;
      return { ...thread, view: stable };
    }),
  );
}
