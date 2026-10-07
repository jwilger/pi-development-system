export type Bump = "none" | "patch" | "minor" | "major";

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

const RANK: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

export function parseVersion(text: string): Version {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!m) {
    throw new Error(`Not a plain MAJOR.MINOR.PATCH version: "${text}"`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** The bump that takes `base` to `head`, or "downgrade" if head is lower. */
export function actualBump(base: Version, head: Version): Bump | "downgrade" {
  if (head.major !== base.major) {
    return head.major > base.major ? "major" : "downgrade";
  }
  if (head.minor !== base.minor) {
    return head.minor > base.minor ? "minor" : "downgrade";
  }
  if (head.patch !== base.patch) {
    return head.patch > base.patch ? "patch" : "downgrade";
  }
  return "none";
}

/**
 * Whether going from `base` to `head` is a large enough bump for `required`.
 * Below 1.0.0 anything may break (semver §4), so a "major" requirement is
 * satisfied by a minor bump.
 */
export function satisfiesBump(base: Version, head: Version, required: Bump): boolean {
  const actual = actualBump(base, head);
  if (actual === "downgrade") return false;
  const effective: Bump = base.major === 0 && required === "major" ? "minor" : required;
  return RANK[actual] >= RANK[effective];
}

export function formatVersion(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Probabilities (0..1) from three independent yes/no questions about a published-package diff. */
export interface BumpEvidence {
  /** Existing users' code or workflows would break. */
  breaking: number;
  /** New backward-compatible capability was added. */
  feature: number;
  /** Anything users could observe in the published contents changed at all. */
  observable: number;
}

/**
 * The required bump is the highest level the evidence supports, so the policy lives here and
 * Jev only answers narrow questions. `confidence` is the weakest answer the decision rests on
 * (a "no" at 0.9 supports 0.9), so one uncertain link lowers it but ordinal spread does not.
 */
export function decideBump(
  e: BumpEvidence,
  options: { preStable?: boolean } = {},
): { bump: Bump; confidence: number } {
  const support = (p: number, yes: boolean): number => (yes ? p : 1 - p);
  if (options.preStable) {
    // Below 1.0.0 a breaking change needs only a minor bump (semver §4), so "breaking or new
    // feature" is a single question and Jev need not separate the two.
    return decideBump(
      { breaking: 0, feature: Math.max(e.breaking, e.feature), observable: e.observable },
      {},
    );
  }
  if (e.breaking >= 0.5) return { bump: "major", confidence: e.breaking };
  const notBreaking = support(e.breaking, false);
  if (e.feature >= 0.5) return { bump: "minor", confidence: Math.min(notBreaking, e.feature) };
  const notFeature = support(e.feature, false);
  if (e.observable >= 0.5) {
    return { bump: "patch", confidence: Math.min(notBreaking, notFeature, e.observable) };
  }
  return {
    bump: "none",
    confidence: Math.min(notBreaking, notFeature, support(e.observable, false)),
  };
}
