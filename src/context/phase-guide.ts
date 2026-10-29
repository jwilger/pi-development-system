import { assertNever } from "../core/exhaustive.ts";
import type { Phase } from "../core/types.ts";

/** What to do in each phase, in one paragraph. Pure; the `devsys` tool and its description both use it. */
export function phaseGuide(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "Nothing is in flight. For new work or a fix, call devsys_intake with the user's request before editing: it sizes the work and names the planning artifacts it needs.";
    case "intake":
    case "planning":
      return "Planning. Choose one usable increment and a failing behavioral test; planning is a handoff aid, not a complete specification. Check handoff records once: fix structural errors, but subjective readiness is advisory. Ask only for a concrete missing decision that prevents safe implementation. After two process-only attempts without implementation or acceptance evidence, simplify to the next test or escalate one precise blocker. When the user approves the plan call devsys_begin_work; existing approval covers routine continuation.";
    case "implementing":
      return "Implementing one usable slice. Implement directly when you have the context; delegate only independent work or focused expertise, with an integration check. Write a failing test first for the requested behavior, make it pass with the least code, run the tests and read the result before claiming anything. If two process-only attempts add no implementation or acceptance evidence, stop coordinating and take the next test-first step or escalate one concrete blocker. Push when the slice is complete and independently reviewed: a push of a clean tree closes it (devsys_finish_slice closes it explicitly).";
    case "reviewing":
      return "Reviewing. Call devsys_review_start for a fresh-context review, give its diffDigest to devsys_review_record (the reviewer submits through devsys_submit_review), fix every blocking and should-fix finding (red-first still applies), and review the fixed diff until the configured requirement is satisfied (default: one clean independent round, not a three-round streak). Do not reroll real findings or add clean rounds without a concrete risk; escalate an unresolved blocker instead. Then the slice moves to delivering.";
    case "delivering":
      return "Delivering. The review is satisfied. Commit with a rationale, push, and release; a push of a clean tree closes the slice (devsys_finish_slice closes it explicitly, or abandons it with a reason). Editing source reopens implementing. A red trunk (CI) is repaired first.";
    default:
      return assertNever(phase);
  }
}
