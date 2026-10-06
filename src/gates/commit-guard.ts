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

/** What is about to be committed, as far as the working tree shows (staged and unstaged tracked changes). */
async function pendingDiff(
  exec: Exec,
  cwd: string,
): Promise<{ stat: string; diff: string } | undefined> {
  try {
    const [stat, diff] = await Promise.all([
      exec("git", ["diff", "HEAD", "--stat"], { cwd, timeout: 10_000 }),
      exec("git", ["diff", "HEAD"], { cwd, timeout: 10_000 }),
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
): Promise<Need[]> {
  const pending = await pendingDiff(deps.exec, ctx.cwd);
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
): Promise<Need[]> {
  const needs = messageNeeds(message);
  const bodyPresent = !needs.some((n) => n.why.startsWith("the message has no body"));
  const viaJev = await jevNeeds(deps, ctx, message, bodyPresent);
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
    for (const message of known) {
      for (const need of await needsOf(deps, ctx, message)) {
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
