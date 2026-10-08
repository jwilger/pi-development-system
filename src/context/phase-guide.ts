import { assertNever } from "../core/exhaustive.ts";
import type { Phase } from "../core/types.ts";

/** What to do in each phase, in one paragraph. Pure; the `devsys` tool and its description both use it. */
export function phaseGuide(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "Nothing is in flight. For new work or a fix, call devsys_intake with the user's request before editing: it sizes the work and names the planning artifacts it needs.";
    case "intake":
    case "planning":
      return "Planning. Produce the artifacts the sizing asked for, write task records (check each with devsys_task_check), and when the user approves the plan call devsys_begin_work.";
    case "implementing":
      return "Implementing one slice. Write a failing test first, make it pass with the least code, run the tests and read the result before claiming anything. Push when the slice is complete and reviewed: a push of a clean tree closes it (devsys_finish_slice closes it explicitly).";
    case "reviewing":
      return "Reviewing. Call devsys_review_start for a fresh-context review, pass its packet and diffDigest to devsys_review_record, fix every blocking and should-fix finding (red-first still applies), and repeat until the review is satisfied; then the slice moves to delivering.";
    case "delivering":
      return "Delivering. The review is satisfied. Commit with a rationale, push, and release; a push of a clean tree closes the slice (devsys_finish_slice closes it explicitly, or abandons it with a reason). Editing source reopens implementing. A red trunk (CI) is repaired first.";
    default:
      return assertNever(phase);
  }
}
