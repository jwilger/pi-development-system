import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { type CommitExtraction, extractCommits } from "../core/commit-command.ts";
import {
  findForbiddenTrailerKeys,
  findForbiddenTrailers,
  hasRationaleBody,
  parseConventionalCommit,
} from "../core/commit-message.ts";
import type { Exec } from "../core/exec.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeCommit, MIX_THRESHOLD, RATIONALE_FLOOR } from "../jev/questions/commit.ts";
import type { SessionState } from "../state/session-state.ts";
import { departureUse } from "./departure-use.ts";

export type CommitGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
};

type Need = { gate: GateId; why: string };

const gateId = (id: string): GateId => {
  const parsed = parseGateId(id);
  if (isParseError(parsed)) throw new Error(parsed.message);
  return parsed;
};

const RATIONALE = gateId("commit.rationale");
const MIXED = gateId("commit.mixed-change");

const readMessageFile = (cwd: string, path: string): string | undefined => {
  try {
    const file = resolve(cwd, path);
    if (!statSync(file).isFile()) return undefined; // never read a FIFO or device (it can block)
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

const messageOf = (extracted: CommitExtraction, cwd: string): string | undefined => {
  if (extracted.kind === "message") return extracted.message;
  return extracted.kind === "file" ? readMessageFile(cwd, extracted.path) : undefined;
};

/** Deterministic checks: Conventional subject and a prose rationale body. */
function messageNeeds(message: string): Need[] {
  const parsed = parseConventionalCommit(message);
  if (!parsed.ok) return [{ gate: RATIONALE, why: parsed.error.message }];
  return hasRationaleBody(message)
    ? []
    : [{ gate: RATIONALE, why: "the message has no body explaining why the change was made" }];
}

/** `-a`/`--all`, or a `git add` in the same command, widen the commit beyond what is staged. */
const stagesEverything = (command: string): boolean =>
  /(?:^|\s)(?:-[a-zA-Z]*a[a-zA-Z]*|--all|--include)(?:\s|$)|\bgit\s+add\b/.test(command);

/** What is about to be committed: the staged changes, or every tracked change when the commit stages them itself. */
async function pendingDiff(
  exec: Exec,
  cwd: string,
  command: string,
): Promise<{ stat: string; diff: string } | undefined> {
  try {
    const base = stagesEverything(command) ? ["diff", "HEAD"] : ["diff", "--cached"];
    const [stat, diff] = await Promise.all([
      exec("git", [...base, "--stat"], { cwd, timeout: 10_000 }),
      exec("git", base, { cwd, timeout: 10_000 }),
    ]);
    if (stat.code !== 0 || diff.code !== 0 || diff.stdout.trim() === "") return undefined;
    return { stat: stat.stdout, diff: diff.stdout };
  } catch {
    return undefined;
  }
}

async function jevNeeds(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  message: string,
  bodyPresent: boolean,
  command: string,
): Promise<Need[]> {
  const pending = await pendingDiff(deps.exec, ctx.cwd, command);
  if (pending === undefined) return [];
  const judged = await judgeCommit(deps.jev(ctx), {
    message,
    diffStat: pending.stat,
    diff: pending.diff,
  });
  if (!judged.ok) return [];
  const needs: Need[] = [];
  if (bodyPresent && judged.value.rationale < RATIONALE_FLOOR) {
    needs.push({ gate: RATIONALE, why: "Jev reads the body as restating what changed, not why" });
  }
  if (judged.value.mixesStructuralAndBehavioural >= MIX_THRESHOLD) {
    needs.push({
      gate: MIXED,
      why: "Jev reads this diff as mixing a structural change with a behavioural one",
    });
  }
  return needs;
}

const blockReason = (need: Need): string =>
  `${need.gate}: ${need.why}. Commit messages carry their rationale and structural and behavioural ` +
  "changes go in separate commits. Fix the commit (split it, or write the why in the body), or if " +
  `departing is deliberate call devsys_record_departure with gate "${need.gate}", what you are doing ` +
  "instead, why, and the cost if wrong; then retry.";

const forbiddenReason = (found: readonly string[]): string =>
  `commit.forbidden-trailer: this commit carries an AI attribution (${found.join("; ")}). ` +
  "Commits in this repository have no Co-Authored-By or generated-by trailers and this is not " +
  "something to depart from. Remove the trailer and commit again.";

/** AI trailers in any message, --trailer value, or the command text itself (heredocs, printf, echo). */
function forbiddenIn(
  command: string,
  extractions: readonly CommitExtraction[],
  messages: readonly (string | undefined)[],
): string[] {
  const trailers = extractions.flatMap((e) => (e.kind === "unknown" ? e.trailers : []));
  const text = [...messages, ...trailers].join("\n");
  return [...findForbiddenTrailers(text), ...findForbiddenTrailerKeys(command)];
}

async function needsOf(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  message: string,
  command: string,
): Promise<Need[]> {
  const needs = messageNeeds(message);
  const bodyPresent = !needs.some((n) => n.why.startsWith("the message has no body"));
  const viaJev = await jevNeeds(deps, ctx, message, bodyPresent, command);
  return [...needs, ...viaJev.filter((n) => !needs.some((m) => m.gate === n.gate))];
}

/** Soft gates on `git commit`: rationale, Conventional shape, structural/behavioural separation; AI trailers are refused. */
export function registerCommitGuard(deps: CommitGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const command = event.input.command;
    const extractions = extractCommits(command);
    if (extractions.length === 0) return undefined;
    const messages = extractions.map((e) => messageOf(e, ctx.cwd));

    const forbidden = forbiddenIn(command, extractions, messages);
    if (forbidden.length > 0) return { block: true, reason: forbiddenReason(forbidden) };

    const known = messages.flatMap((m) => (m === undefined ? [] : [m]));
    const all: Need[] = [];
    // A -F file that cannot be read now (written by this same command, or stdin) cannot be checked.
    if (extractions.some((e, i) => e.kind === "file" && messages[i] === undefined)) {
      all.push({
        gate: RATIONALE,
        why: "the message file cannot be read before the commit runs, so its rationale cannot be checked; use -m or a heredoc",
      });
    }
    for (const message of known) {
      for (const need of await needsOf(deps, ctx, message, command)) {
        if (!all.some((n) => n.gate === need.gate)) all.push(need);
      }
    }
    const uses = all.map((need) => ({ need, use: departureUse(deps.state, need.gate) }));
    const uncovered = uses.find(({ use }) => !use.hasOpen());
    if (uncovered !== undefined) return { block: true, reason: blockReason(uncovered.need) };
    for (const { use } of uses) use.consume();
    return undefined;
  });
}
