import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TestPathProfile = { readonly testGlobs?: readonly string[] };

const TEST_DIR = /(^|\/)(test|tests|__tests__|spec|specs|e2e)(\/|$)/;
const TEST_DIR_ITSELF = /(^|\/)(test|tests|__tests__|spec|specs|e2e)\/?$/;
const SOURCE_EXT =
  /\.(?:[cm]?[jt]sx?|py|rb|rs|go|java|kt|kts|scala|cs|ex|exs|php|swift|c|cc|cpp|h|hpp|sh|lua|clj|hs|ml)$/;
const GLOBBY = /[*?[\]{]/;

const PATTERNS: readonly RegExp[] = [
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
  // Inside a test directory only source files (or globs that may expand to them) are tests;
  // logs, caches, snapshots and docs are not. The directory itself is, so `rm -rf tests` is caught.
  if (TEST_DIR.test(normalized)) {
    return (
      TEST_DIR_ITSELF.test(normalized) || SOURCE_EXT.test(normalized) || GLOBBY.test(normalized)
    );
  }
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
