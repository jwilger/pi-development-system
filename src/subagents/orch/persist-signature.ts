import type { SavedThread } from "../types.ts";

const LIVE = new Set(["starting", "running"]);

/**
 * What decides whether the registry needs writing again.
 *
 * pi appends every `appendEntry` to the session file and never rewrites it, and each
 * registry entry holds every thread (about 12 KB each). A running thread changes its
 * status line on every tool call, so signing the full snapshot wrote hundreds of
 * kilobytes per tool call: one session reached 2.3 GB and pi ran out of memory loading
 * it. A live thread's status and output are not needed to restore it (a reload marks it
 * interrupted), so they stay out of the signature. Starting, settling, pausing and
 * adding or removing a thread still write.
 */
export function registrySignature(threads: readonly SavedThread[]): string {
  return JSON.stringify(
    threads.map((thread) =>
      LIVE.has(thread.view.state)
        ? { ...thread, view: { ...thread.view, status: "", output: undefined } }
        : thread,
    ),
  );
}
