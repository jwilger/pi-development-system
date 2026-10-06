import type { Tier } from "./types.ts";

export type GateInfo = { readonly tier: Tier; readonly default: string };

/** Registered gate ids (plan Appendix A); grows per increment. Qualified ids use their base entry. */
export const GATES: Readonly<Record<string, GateInfo>> = {
  "git.history-rewrite": { tier: "hard", default: "never rewrite published history" },
  "git.force-push": { tier: "hard", default: "never force-push" },
  "git.branch-delete-remote": { tier: "hard", default: "never delete remote branches" },
  "git.destructive-reset": {
    tier: "hard",
    default: "never discard uncommitted work with reset --hard",
  },
  "git.no-verify": { tier: "hard", default: "never skip commit hooks" },
  "tests.weaken": { tier: "soft", default: "never weaken, skip or delete tests to get green" },
  "commit.rationale": { tier: "soft", default: "commit messages carry their rationale" },
  "commit.mixed-change": {
    tier: "soft",
    default: "structural and behavioural changes go in separate commits",
  },
  "commit.forbidden-trailer": { tier: "soft", default: "no Co-Authored-By or AI trailers" },
  "push.red-trunk": { tier: "soft", default: "do not push unrelated work onto a red trunk" },
  "push.delivery-mode": { tier: "soft", default: "follow the repository's delivery mode" },
  "tdd.red-first": { tier: "soft", default: "write a failing test before changing behaviour" },
  "lints.suppression": { tier: "soft", default: "do not suppress lints without a reasoned note" },
  "review.unsatisfied": { tier: "soft", default: "finish the fresh-context review before release" },
  "scope.expansion": { tier: "soft", default: "stay within the agreed scope" },
  "models.phase-mismatch": { tier: "soft", default: "use the model slot routed for this phase" },
  "artifact.skipped": {
    tier: "soft",
    default: "produce the planning artifact for this size of work",
  },
  "adr.missing": { tier: "soft", default: "record an ADR for architecture-shaping decisions" },
};

/** Looks up a gate by id, ignoring any `:qualifier`. */
export function lookupGate(id: string): GateInfo | undefined {
  const base = id.split(":")[0] ?? id;
  return GATES[base];
}

export const gateIds = (): string[] => Object.keys(GATES);
