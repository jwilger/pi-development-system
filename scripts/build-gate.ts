/**
 * Build gate: while main's build is broken, only `fix(ci): ` commits (that Jev
 * judges related to the failure) may be added.
 *
 *   commit-msg hook: node scripts/build-gate.ts --message-file <file>
 *   CI:              node scripts/build-gate.ts --ci --before <sha> --after <sha>
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildStateAt, failureLog } from "./lib/ci.ts";
import { cleanMessage, overrideReason, subjectOf } from "./lib/commit.ts";
import { MAIN_BRANCH, MIN_FIX_RELATED } from "./lib/config.ts";
import { type CommitInfo, evaluateBrokenRange } from "./lib/gate.ts";
import { fixRelatedProbability } from "./lib/jev.ts";
import { commitsBetween, ZERO_SHA } from "./lib/range.ts";
import { fail, git } from "./lib/sh.ts";

const { values } = parseArgs({
  options: {
    "message-file": { type: "string" },
    ci: { type: "boolean", default: false },
    before: { type: "string" },
    after: { type: "string" },
  },
});

async function main(): Promise<void> {
  let tip: string;
  if (values.ci) {
    if (!(values.before && values.after)) fail("--ci requires --before and --after");
    if (ZERO_SHA.test(values.before)) return; // new branch: nothing to gate
    tip = values.before;
  } else {
    if (!values["message-file"]) fail("Pass --message-file <file> or --ci");
    git("fetch", "--quiet", "origin", MAIN_BRANCH);
    tip = `origin/${MAIN_BRANCH}`;
  }

  const state = buildStateAt(tip);
  if (state.kind === "green") return;
  if (state.kind === "pending") {
    fail(
      `CI is still running for ${state.sha.slice(0, 8)} on ${MAIN_BRANCH}. Wait for it to finish.`,
    );
  }

  // Build is broken: only fixes are allowed on top of the breaking commit.
  const existing = commitsBetween(state.breakSha, tip, false);
  const incoming: CommitInfo[] = values.ci
    ? commitsBetween(tip, values.after as string, true)
    : [
        {
          sha: null,
          message: cleanMessage(readFileSync(values["message-file"] as string, "utf8")),
          isNew: true,
        },
      ];

  const verdict = evaluateBrokenRange([...existing, ...incoming]);
  if (verdict.violations.length > 0) {
    fail(
      `The ${MAIN_BRANCH} build is broken (since ${state.breakSha.slice(0, 8)}). ` +
        "Only fix(ci): commits are allowed until it is green, and offending commits must be reverted:\n  - " +
        verdict.violations.join("\n  - "),
    );
  }

  const log = failureLog(state.failure.runId);
  for (const commit of verdict.needsRelevance) {
    const label = commit.sha?.slice(0, 8) ?? "this commit";
    const reason = overrideReason(commit.message);
    if (reason) {
      console.warn(`⚠ Jev-Override on ${label}: ${reason}`);
      continue;
    }
    const diff = commit.sha
      ? git("show", "--format=", "--patch", commit.sha)
      : git("diff", "--cached");
    let related: number;
    try {
      related = await fixRelatedProbability({
        diff,
        failureLog: log,
        commitMessage: subjectOf(commit.message),
      });
    } catch (error) {
      fail(
        `Could not ask Jev about ${label}: ${String(error)}\nAdd a "Jev-Override: <reason>" trailer to bypass.`,
      );
    }
    if (related < MIN_FIX_RELATED) {
      fail(
        `Jev is not confident that ${label} only fixes the failing build ` +
          `(P(related) = ${related.toFixed(2)}, need ≥ ${MIN_FIX_RELATED}).\n` +
          `Narrow the change, or add a "Jev-Override: <reason>" trailer.`,
      );
    }
    console.log(`✓ ${label}: related to the failing build (P = ${related.toFixed(2)})`);
  }
}

main().catch((error: unknown) => fail(String(error)));
