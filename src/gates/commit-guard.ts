import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { type CommitExtraction, extractCommit } from "../core/commit-command.ts";
import {
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
    return readFileSync(resolve(cwd, path), "utf8");
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

/** Soft gates on `git commit`: rationale, Conventional shape, structural/behavioural separation; AI trailers are refused. */
export function registerCommitGuard(deps: CommitGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const command = event.input.command;
    const extracted = extractCommit(command);
    if (extracted.kind === "not-commit") return undefined;
    const message = messageOf(extracted, ctx.cwd);

    // Safety net: whatever the message source, the command text itself must not carry an AI trailer
    // (heredocs written to a file first, --trailer values on amends, messages built elsewhere).
    const trailers = extracted.kind === "unknown" ? extracted.trailers.join("\n") : "";
    const forbidden = findForbiddenTrailers(`${message ?? ""}\n${trailers}\n${command}`);
    if (forbidden.length > 0) {
      return {
        block: true,
        reason:
          `commit.forbidden-trailer: this message carries an AI attribution (${forbidden.join("; ")}). ` +
          "Commits in this repository have no Co-Authored-By or generated-by trailers and this is not " +
          "something to depart from. Remove the trailer and commit again.",
      };
    }
    if (message === undefined) return undefined;

    const needs = messageNeeds(message);
    const bodyPresent = !needs.some((n) => n.why.startsWith("the message has no body"));
    const viaJev = await jevNeeds(deps, ctx, message, bodyPresent);
    const all = [...needs, ...viaJev.filter((n) => !needs.some((m) => m.gate === n.gate))];
    const uses = all.map((need) => ({ need, use: departureUse(deps.state, need.gate) }));
    const uncovered = uses.find(({ use }) => !use.hasOpen());
    if (uncovered !== undefined) return { block: true, reason: blockReason(uncovered.need) };
    for (const { use } of uses) use.consume();
    return undefined;
  });
}
