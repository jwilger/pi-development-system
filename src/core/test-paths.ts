export type TestPathProfile = { readonly testGlobs?: readonly string[] };

const PATTERNS: readonly RegExp[] = [
  /(^|\/)(test|tests|__tests__|spec|specs|e2e)\//,
  /\.(test|spec|cy)\.[cm]?[jt]sx?$/,
  /_test\.(go|rb|py|exs?|rs)$/,
  /(^|\/)test_[^/]+\.py$/,
  /_spec\.rb$/,
];

const SPECIALS = /[.+^$(){}|[\]\\]/g;

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(SPECIALS, "\\$&")
    .replace(/\*\*/g, "@@GLOBSTAR@@")
    .replace(/\*/g, "[^/]*")
    .replace(/@@GLOBSTAR@@/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** Whether a repo-relative path is a test file (conventions, plus profile-supplied globs). */
export function isTestPath(path: string, profile?: TestPathProfile): boolean {
  const normalized = path.replace(/^\.\//, "");
  if (PATTERNS.some((p) => p.test(normalized))) return true;
  return (profile?.testGlobs ?? []).some((g) => globToRegExp(g).test(normalized));
}
