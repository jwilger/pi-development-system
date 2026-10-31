import { assertNever } from "../core/exhaustive.ts";
import type { Phase } from "../core/types.ts";

export const CONTINUATION_GUIDANCE = `## Continue approved work before considering intake

Inspect the focused active goal and acceptance criteria (use its public tool when available), the active slice, and recent review, verification and completion evidence before deciding whether a request is genuinely new work. Workflow phase idle is not proof that no goal remains.

Repairs required by existing acceptance criteria stay in the existing slice: review findings, completion-auditor findings, failed verification, and unfinished evidence or reports. Do not call devsys_intake or seek renewed approval for these repairs. Checkpoints, resumed sessions, compaction and delayed agent notifications alone do not start or replace work. A notification supplies evidence, not authorization or a new user request. Recover missing context before judging scope. Once the available evidence establishes that remaining work satisfies the approved scope, continue that work directly; do not repeat scope inspection or planning instead of repairing it.

Call devsys_intake for genuinely new work or a planned next slice after the prior slice is closed, not routine continuation. Preserve scope-change detection: unrelated requests are not automatically authorized by an active goal. Ask only for a real unresolved scope decision, replacement of active work, new authorization or another user-owned choice. Classifier uncertainty and remaining acceptance work are not permission questions. Existing approval boundaries and concrete blocker rules still apply; never bypass a gate. This is scope guidance, not mechanical authorization.`;

/** Phase guidance shared by the `devsys` tool and its description. Pure. */
export function phaseGuide(phase: Phase): string {
  switch (phase) {
    case "idle":
      return `No local slice is in flight.\n\n${CONTINUATION_GUIDANCE}`;
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
