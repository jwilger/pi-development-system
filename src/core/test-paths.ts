import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TestPathProfile = { readonly testGlobs?: readonly string[] };

const PATTERNS: readonly RegExp[] = [
  /(^|\/)(test|tests|__tests__|spec|specs|e2e)(\/|$)/,
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

/**
 * Repo-relative form of a path exactly as pi would resolve it: a leading `@` is dropped, `~` expands
 * to the home directory and `file://` URLs are decoded, so guards see the file that is really touched.
 */
export function normalizeRepoPath(cwd: string, input: string, home: string): string {
  let path = input.startsWith("@") ? input.slice(1) : input;
  if (path === "~") path = home;
  else if (path.startsWith("~/")) path = join(home, path.slice(2));
  else if (/^file:\/\//.test(path)) path = fileURLToPath(path);
  return isAbsolute(path) ? relative(cwd, path) : relative(cwd, resolve(cwd, path)) || ".";
}
