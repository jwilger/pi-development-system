import type { JevError } from "../jev/client.ts";

const actions = {
  "insufficient-evidence":
    "Inspect the changed assertions and existing requirements. Supply the cited contract and retained coverage using devsys_supply_test_contract with path, full proposed after and contractEvidence; retry the same normal edit. Evidence is not approval.",
  "invalid-output":
    "The assessor output is invalid, not a prohibition or owner decision. Retry once through the normal gate; if it recurs inspect the assessment configuration and report the concrete failure. Do not fabricate answers.",
  infrastructure:
    "Inspect provider availability/configuration and retry only when justified. A sustained external failure may need specific intervention; uncertainty is not permission.",
};

/** The host hook carries only reason:string, so retain machine-readable causes as JSON. */
export function assessmentRecovery(path: string, why: string, cause: JevError): string {
  const category =
    cause.kind === "assessment-unresolved"
      ? (cause.category ?? "insufficient-evidence")
      : "infrastructure";
  return `${why}\n${JSON.stringify({
    kind: "assessment-recovery",
    gate: "tests.weaken",
    path,
    category,
    cause,
    recovery: actions[category],
    goal: "Keep recoverable assessment uncertainty agent-side; do not mark a persistent goal blocked or ask for renewed approved-scope approval. After bounded investigation, escalate only a concrete remaining external blocker or actual owner policy decision; do not retry forever or bypass the gate.",
  })}`;
}
