import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TestPathProfile = { readonly testGlobs?: readonly string[] };

const TEST_DIR = /(^|\/)(test|tests|__tests__)(\/|$)|^(spec|specs|e2e)(\/|$)/;
const TEST_DIR_ITSELF = /(^|\/)(test|tests|__tests__)\/?$|^(spec|specs|e2e)\/?$/;
const SOURCE_EXT =
  /\.(?:[cm]?[jt]sx?|py|rb|rs|go|java|kt|kts|scala|cs|ex|exs|php|swift|c|cc|cpp|h|hpp|sh|lua|clj|hs|ml)$/;
const GLOBBY = /[*?[\]{]/;

const PATTERNS: readonly RegExp[] = [
  /\.(test|spec|cy)\.[cm]?[jt]sx?$/,
  /_test\.(go|rb|py|exs?|rs)$/,
  /(^|\/)test_[^/]+\.py$/,
  /_spec\.rb$/,
  /(^|\/)tests?\.rs$/,
  /_tests\.rs$/,
];

/** Whether `rest` matches some suffix of `path`; a `*` may not cross a `/` when `withinSegment`. */
function matchesSuffix(rest: string, path: string, withinSegment: boolean): boolean {
  for (let i = 0; i <= path.length; i++) {
    if (matchGlob(rest, path.slice(i))) return true;
    if (withinSegment && (path[i] === "/" || i === path.length)) return false;
  }
  return false;
}

/** Glob match without building a RegExp: `**` spans directories, `*` stays within a segment. */
function matchGlob(glob: string, path: string): boolean {
  if (glob === "") return path === "";
  if (glob.startsWith("**")) return matchesSuffix(glob.slice(2), path, false);
  if (glob.startsWith("*")) return matchesSuffix(glob.slice(1), path, true);
  return path !== "" && path[0] === glob[0] && matchGlob(glob.slice(1), path.slice(1));
}

/** Whether a repo-relative path is a test file (conventions, plus profile-supplied globs). */
export function isTestPath(path: string, profile?: TestPathProfile): boolean {
  const normalized = path.replace(/^\.\//, "");
  if (PATTERNS.some((p) => p.test(normalized))) return true;
  // Inside a test directory only source files (or globs that may expand to them) are tests;
  // logs, caches, snapshots and docs are not. The directory itself is, so `rm -rf tests` is caught.
  if (TEST_DIR.test(normalized)) {
    if (TEST_DIR_ITSELF.test(normalized) || SOURCE_EXT.test(normalized)) return true;
    // A glob may expand to tests, unless it ends in a literal non-source extension (*.log, *.snap).
    return GLOBBY.test(normalized) && !/\.[A-Za-z0-9]+$/.test(normalized);
  }
  return (profile?.testGlobs ?? []).some((g) => matchGlob(g, normalized));
}

/** A malformed `file://` URL is treated as the raw path rather than throwing out of a guard. */
function decodeFileUrl(url: string): string {
  try {
    return fileURLToPath(url);
  } catch {
    return url;
  }
}

/**
 * Repo-relative form of a path exactly as pi would resolve it: a leading `@` is dropped, `~` expands
 * to the home directory and `file://` URLs are decoded, so guards see the file that is really touched.
 */
export function normalizeRepoPath(cwd: string, input: string, home: string): string {
  let path = input.startsWith("@") ? input.slice(1) : input;
  if (path === "~") path = home;
  else if (path.startsWith("~/")) path = join(home, path.slice(2));
  else if (/^file:\/\//.test(path)) path = decodeFileUrl(path);
  return isAbsolute(path) ? relative(cwd, path) : relative(cwd, resolve(cwd, path)) || ".";
}
