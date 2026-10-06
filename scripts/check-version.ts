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
import { fail, git } from "./lib/sh.ts";

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

async function main(): Promise<void> {
  let tip: string;
  let headRef: string | null; // null = the index
  let overrides: string[] = [];
  if (values.ci) {
    if (!values.before || !values.after) fail("--ci requires --before and --after");
    if (ZERO_SHA.test(values.before)) return;
    tip = values.before;
    headRef = values.after;
    overrides = commitsBetween(tip, headRef, true)
      .map((c) => overrideReason(c.message))
      .filter((r): r is string => r !== null);
  } else {
    if (!values.staged) fail("Pass --staged or --ci");
    git("fetch", "--quiet", "origin", MAIN_BRANCH);
    tip = `origin/${MAIN_BRANCH}`;
    headRef = null;
    const env = process.env.JEV_OVERRIDE?.trim();
    if (env) overrides = [env];
  }

  // While broken, the version in main was bumped but never released, so compare
  // against the last release to avoid demanding a second bump for the fix.
  const state = buildStateAt(tip);
  const baseRef = state.kind === "broken" ? (lastRelease(tip) ?? tip) : tip;

  const headSpec = headRef ? `${headRef}:package.json` : ":package.json";
  const base = manifestAt(`${baseRef}:package.json`);
  const head = manifestAt(headSpec);
  const baseVersion = parseVersion(base.version);
  const headVersion = parseVersion(head.version);

  const diffArgs = headRef ? [baseRef, headRef] : ["--cached", baseRef];
  const changed = git("diff", "--name-only", ...diffArgs)
    .split("\n")
    .filter(Boolean);
  const published = changed.filter((f) => PUBLISHED_PATHS.some((p) => f === p || f.startsWith(p)));

  let required: Bump = "none";
  if (published.length > 0) {
    if (overrides.length > 0) {
      console.warn(`⚠ Jev-Override (${overrides.join("; ")}): requiring at least a patch bump`);
      required = "patch";
    } else {
      const diff = git("diff", ...diffArgs, "--", ...published);
      try {
        const j = await judgeBump({
          packageName: base.name,
          baseVersion: base.version,
          changedFiles: published,
          diff,
        });
        if (j.confidence < MIN_BUMP_CONFIDENCE) {
          fail(
            `Jev is not confident about the required bump (${j.bump}, confidence ${j.confidence.toFixed(2)} < ${MIN_BUMP_CONFIDENCE}). ` +
              "Split the change, or override with JEV_OVERRIDE / a Jev-Override: trailer.",
          );
        }
        required = j.bump;
        console.log(`Jev: ${j.bump} bump required (confidence ${j.confidence.toFixed(2)})`);
      } catch (error) {
        fail(`Could not ask Jev for the semver bump: ${String(error)}`);
      }
    }
  }

  if (!satisfiesBump(baseVersion, headVersion, required)) {
    fail(
      `Version ${formatVersion(baseVersion)} (${baseRef}) → ${formatVersion(headVersion)}: ` +
        `a "${required}" bump is required for the published changes. Update package.json.`,
    );
  }
  console.log(
    `✓ version ${formatVersion(baseVersion)} → ${formatVersion(headVersion)} satisfies "${required}"`,
  );
}

main().catch((error: unknown) => fail(String(error)));
