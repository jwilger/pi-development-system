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
