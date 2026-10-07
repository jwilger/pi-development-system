/**
 * Semver gate: package.json's version must be bumped at least as far as the
 * code changes require, relative to origin/main (or, while the build is broken,
 * the last release).
 *
 *   pre-commit hook: node scripts/check-version.ts --staged
 *   CI:              node scripts/check-version.ts --ci --before <sha> --after <sha>
 *
 * Bypass Jev: JEV_OVERRIDE="<reason>" locally; a `Jev-Override:` trailer on any
 * commit in the pushed range in CI.
 */
import { parseArgs } from "node:util";
import { buildStateAt } from "./lib/ci.ts";
import { overrideReason } from "./lib/commit.ts";
import { MAIN_BRANCH, MIN_BUMP_CONFIDENCE, PUBLISHED_PATHS } from "./lib/config.ts";
import { judgeBump } from "./lib/jev.ts";
import { commitsBetween, ZERO_SHA } from "./lib/range.ts";
import { type Bump, formatVersion, parseVersion, satisfiesBump } from "./lib/semver.ts";
import { fail, git, out, warn } from "./lib/sh.ts";

const { values } = parseArgs({
  options: {
    staged: { type: "boolean", default: false },
    ci: { type: "boolean", default: false },
    before: { type: "string" },
    after: { type: "string" },
  },
});

interface Manifest {
  name: string;
  version: string;
}

function manifestAt(spec: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(git("show", spec));
  } catch (error) {
    return fail(`Could not read ${spec}: ${String(error)}`);
  }
  const m = parsed as Partial<Manifest>;
  if (typeof m.name !== "string" || typeof m.version !== "string") {
    fail(`${spec} lacks a name/version`);
  }
  return { name: m.name, version: m.version };
}

function lastRelease(tip: string): string | null {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", tip);
  } catch {
    return null;
  }
}

type Range = {
  tip: string;
  /** null = the index */
  headRef: string | null;
  overrides: string[];
};

/** The commits under check: `--ci` compares two SHAs, `--staged` the index against origin/main. */
function resolveRange(): Range {
  if (values.ci) {
    if (!(values.before && values.after)) fail("--ci requires --before and --after");
    if (ZERO_SHA.test(values.before)) process.exit(0);
    const overrides = commitsBetween(values.before, values.after, true)
      .map((c) => overrideReason(c.message))
      .filter((r): r is string => r !== null);
    return { tip: values.before, headRef: values.after, overrides };
  }
  if (!values.staged) fail("Pass --staged or --ci");
  git("fetch", "--quiet", "origin", MAIN_BRANCH);
  const env = process.env.JEV_OVERRIDE?.trim();
  return { tip: `origin/${MAIN_BRANCH}`, headRef: null, overrides: env ? [env] : [] };
}

/** The bump Jev (or an override) says the published changes need; exits through `fail` when Jev cannot say. */
async function requiredBump(
  base: Manifest,
  published: string[],
  diffArgs: string[],
  overrides: string[],
): Promise<Bump> {
  if (published.length === 0) return "none";
  if (overrides.length > 0) {
    warn(`⚠ Jev-Override (${overrides.join("; ")}): requiring at least a patch bump`);
    return "patch";
  }
  try {
    const j = await judgeBump({
      packageName: base.name,
      baseVersion: base.version,
      changedFiles: published,
      diff: git("diff", ...diffArgs, "--", ...published),
    });
    const evidence = `breaking ${j.evidence.breaking.toFixed(2)}, feature ${j.evidence.feature.toFixed(2)}, observable ${j.evidence.observable.toFixed(2)}`;
    if (!(j.confidence >= MIN_BUMP_CONFIDENCE)) {
      return fail(
        `Jev is not confident about the required bump (${j.bump}, confidence ${j.confidence.toFixed(2)} < ${MIN_BUMP_CONFIDENCE}; ${evidence}). ` +
          "Split the change, or override with JEV_OVERRIDE / a Jev-Override: trailer.",
      );
    }
    out(`Jev: ${j.bump} bump required (confidence ${j.confidence.toFixed(2)}; ${evidence})`);
    return j.bump;
  } catch (error) {
    return fail(`Could not ask Jev for the semver bump: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  const { tip, headRef, overrides } = resolveRange();

  // While broken, the version in main was bumped but never released, so compare
  // against the last release to avoid demanding a second bump for the fix.
  const state = buildStateAt(tip);
  const baseRef = state.kind === "broken" ? (lastRelease(tip) ?? tip) : tip;

  const base = manifestAt(`${baseRef}:package.json`);
  const head = manifestAt(headRef ? `${headRef}:package.json` : ":package.json");
  const baseVersion = parseVersion(base.version);
  const headVersion = parseVersion(head.version);

  const diffArgs = headRef ? [baseRef, headRef] : ["--cached", baseRef];
  const changed = git("diff", "--name-only", ...diffArgs)
    .split("\n")
    .filter(Boolean);
  const published = changed.filter((f) => PUBLISHED_PATHS.some((p) => f === p || f.startsWith(p)));
  const required = await requiredBump(base, published, diffArgs, overrides);

  if (!satisfiesBump(baseVersion, headVersion, required)) {
    fail(
      `Version ${formatVersion(baseVersion)} (${baseRef}) → ${formatVersion(headVersion)}: ` +
        `a "${required}" bump is required for the published changes. Update package.json.`,
    );
  }
  out(
    `✓ version ${formatVersion(baseVersion)} → ${formatVersion(headVersion)} satisfies "${required}"`,
  );
}

main().catch((error: unknown) => fail(String(error)));
