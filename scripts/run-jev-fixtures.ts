/**
 * Runs the live-model Jev fixtures when the change touches Jev-facing paths, and says so when
 * it does not. The run is skipped by path, never by a skipped test: when it runs, a missing
 * credential or a miss below a fixture's pass rate fails it.
 *
 *   pre-commit hook: node scripts/run-jev-fixtures.ts --staged
 *   CI:              node scripts/run-jev-fixtures.ts --before <sha>
 */
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { touchesJevFacing } from "./lib/jev-paths.ts";
import { ZERO_SHA } from "./lib/range.ts";
import { git } from "./lib/sh.ts";

const { values } = parseArgs({
  options: { staged: { type: "boolean", default: false }, before: { type: "string" } },
});

const changed = (): string[] | undefined => {
  try {
    if (values.staged) return git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
    if (values.before === undefined || ZERO_SHA.test(values.before)) return undefined;
    return git("diff", "--name-only", `${values.before}..HEAD`).split("\n").filter(Boolean);
  } catch {
    return undefined; // an unknown base (shallow clone, force push) must run, never skip
  }
};

const paths = changed();
if (paths !== undefined && !touchesJevFacing(paths)) {
  console.log("jev fixtures: no Jev-facing change; live run not needed");
  process.exit(0);
}
console.log("jev fixtures: running live-model fixtures (npm run test:jev)");
const result = spawnSync("npm", ["run", "--silent", "test:jev"], { stdio: "inherit" });
process.exit(result.status ?? 1);
