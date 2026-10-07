import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "../core/redact.ts";
import { isTestPath, normalizeRepoPath } from "../core/test-paths.ts";
import {
  addedLines,
  applyEdits,
  bashMutations,
  isPureAddition,
  normalizeText,
  type WeakeningSignals,
  weakeningSignals,
} from "../core/test-weakening.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeTestChange, WEAKENS_THRESHOLD } from "../jev/questions/test-change.ts";
import type { SessionState } from "../state/session-state.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";
import { departureUse } from "./departure-use.ts";

export type TestGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  approvals: ApprovalStore;
  jev: (ctx: ExtensionContext) => Jev;
  now?: () => Date;
};

type Change = {
  path: string;
  before: string;
  /** `undefined` means the file is gone; an `overwrite` carries the shell command instead. */
  after: string | undefined;
  rewritten?: string | undefined;
};

type Verdict =
  | { kind: "allow" }
  | { kind: "require-departure"; why: string }
  | { kind: "hard-stop"; why: string };

const GATE_ID = "tests.weaken";

const describeSignals = (deleted: boolean, signals: WeakeningSignals): string | undefined => {
  if (deleted) return "deletes the test file";
  if (signals.addsSkip) return "skips tests";
  if (signals.emptied) return "empties the test file";
  if (signals.commentedOut) return "comments out test code";
  return undefined;
};

const readIfExists = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

const repoPath = (cwd: string, path: string): string => normalizeRepoPath(cwd, path, homedir());

/** Added lines that can disable tests without matching a skip marker (block comments, early exits). */
const RISKY_ADDITION = /\/\*|<!--|=begin\b|"""|'''|\breturn\b|\bthrow\b|\bexit\b|\bpanic\(/;

const GLOB = /[*?[\]{]/;

const NO_SIGNALS: WeakeningSignals = { addsSkip: false, emptied: false, commentedOut: false };

/** Adding lines never weakens a test unless an added line itself disables something. */
const isHarmlessAddition = (before: string, after: string, signals: WeakeningSignals): boolean =>
  !(signals.addsSkip || signals.commentedOut) &&
  isPureAddition(before, after) &&
  !addedLines(before, after).some((line) => RISKY_ADDITION.test(line));

/** Jev's reading of a change, or `undefined` when it sees nothing to act on. */
function jevVerdict(
  judged: { weakens: number; motive: string },
  deterministicSignal: boolean,
): Verdict | undefined {
  const weakening = judged.weakens >= WEAKENS_THRESHOLD;
  if ((weakening || deterministicSignal) && judged.motive === "gate-gaming") {
    return {
      kind: "hard-stop",
      why: "Jev reads this change as weakening a check to get a green result",
    };
  }
  return weakening
    ? {
        kind: "require-departure",
        why: `Jev reads this change as weakening the tests (motive: ${judged.motive})`,
      }
    : undefined;
}

const parsedGate = (): GateId | undefined => {
  const parsed = parseGateId(GATE_ID);
  return isParseError(parsed) ? undefined : parsed;
};

const judge = async (
  deps: TestGuardDeps,
  change: Change,
  ctx: ExtensionContext,
): Promise<Verdict> => {
  const deleted = change.after === undefined && change.rewritten === undefined;
  const after = change.after ?? change.rewritten ?? "";
  const signals = deleted ? NO_SIGNALS : weakeningSignals(change.before, after);
  if (!deleted && isHarmlessAddition(change.before, after, signals)) return { kind: "allow" };
  const deterministic = describeSignals(deleted, signals);
  const judged = await judgeTestChange(deps.jev(ctx), {
    path: change.path,
    before: change.before,
    after: after === "" ? undefined : redactSecrets(after),
  });
  const fromJev = judged.ok ? jevVerdict(judged.value, deterministic !== undefined) : undefined;
  if (fromJev !== undefined) return fromJev;
  return deterministic !== undefined
    ? { kind: "require-departure", why: `this change ${deterministic}` }
    : { kind: "allow" };
};

const bashChanges = (command: string, cwd: string): Change[] =>
  bashMutations(command).flatMap(({ path: written, kind }): Change[] => {
    const target = repoPath(cwd, written);
    // Missing plain paths have nothing to weaken; globs and directories may still hide tests.
    const touched = GLOB.test(target) || existsSync(join(cwd, target));
    if (!(isTestPath(target) && touched)) return [];
    const rewritten = kind === "overwrite" ? `(rewritten by shell command) ${command}` : undefined;
    return [
      { path: target, before: readIfExists(join(cwd, target)) ?? "", after: undefined, rewritten },
    ];
  });

const editChange = (
  path: string,
  before: string,
  edits: ReadonlyArray<{ oldText: string; newText: string }>,
): Change => {
  const after = applyEdits(before, edits);
  if (after !== undefined) return { path, before, after };
  // The edit text does not match statically; let Jev read what the agent intends to write.
  const intended = edits.map((e) => e.newText).join("\n");
  return { path, before, after: undefined, rewritten: `(edit not matched statically) ${intended}` };
};

const fileChanges = (event: ToolCallEvent, cwd: string): Change[] => {
  if (!(isToolCallEventType("write", event) || isToolCallEventType("edit", event))) return [];
  const path = repoPath(cwd, event.input.path);
  const raw = isTestPath(path) ? readIfExists(join(cwd, path)) : undefined;
  if (raw === undefined) return [];
  const before = normalizeText(raw);
  return isToolCallEventType("write", event)
    ? [{ path, before, after: normalizeText(event.input.content) }]
    : [editChange(path, before, event.input.edits)];
};

const collectChanges = (event: ToolCallEvent, ctx: ExtensionContext): Change[] =>
  isToolCallEventType("bash", event)
    ? bashChanges(event.input.command, ctx.cwd)
    : fileChanges(event, ctx.cwd);

type Call = { deps: TestGuardDeps; gate: GateId; event: ToolCallEvent; ctx: ExtensionContext };

const hardStop = async (
  { deps, gate, event, ctx }: Call,
  change: Change,
  why: string,
): Promise<{ block: true; reason: string } | undefined> => {
  const command = `${isToolCallEventType("bash", event) ? "delete" : "change"} ${change.path}`;
  if (deps.approvals.consume(gate, command)) return undefined;
  const outcome = await requestHardStop({
    pi: deps.pi,
    ctx,
    gate,
    command,
    why,
    costIfWrong: "the tests verify less behaviour, so regressions can ship undetected",
    toolCallId: event.toolCallId,
    now: deps.now,
  });
  if (outcome.kind === "approved") return undefined;
  return {
    block: true,
    reason:
      outcome.kind === "unavailable"
        ? `hard stop ${GATE_ID}: ${why} (${change.path}); requires user approval; run interactively`
        : `hard stop ${GATE_ID}: the user declined this change to ${change.path}. Fix the code instead of weakening the test.`,
  };
};

const departureReason = (needing: ReadonlyArray<{ change: Change; why: string }>): string =>
  `${GATE_ID}: ${needing[0]?.why} (${needing.map((n) => n.change.path).join(", ")}). Tests are the oracle; ` +
  "weakening them needs a recorded decision. If this is deliberate, call devsys_record_departure " +
  `with gate "${GATE_ID}", what you are doing instead, why, and the cost if wrong; then retry. ` +
  "Otherwise fix the code, not the test.";

/**
 * Soft gate `tests.weaken`: deleting, skipping, emptying or loosening tests needs a recorded
 * departure; a change Jev reads as gaming a failing gate escalates to a hard stop.
 */
export function registerTestGuard(deps: TestGuardDeps): void {
  const gate = parsedGate();
  if (gate === undefined) return;
  const departure = departureUse(deps.state, gate);

  deps.pi.on("tool_call", async (event, ctx) => {
    const verdicts: Array<{ change: Change; verdict: Verdict }> = [];
    for (const change of collectChanges(event, ctx)) {
      verdicts.push({ change, verdict: await judge(deps, change, ctx) });
    }
    for (const { change, verdict } of verdicts) {
      if (verdict.kind !== "hard-stop") continue;
      const blocked = await hardStop({ deps, gate, event, ctx }, change, verdict.why);
      if (blocked !== undefined) return blocked;
    }
    const needing = verdicts.flatMap(({ change, verdict }) =>
      verdict.kind === "require-departure" ? [{ change, why: verdict.why }] : [],
    );
    if (needing.length === 0) return undefined;
    if (departure.hasOpen()) {
      // One departure covers every path in this single tool call.
      departure.consume();
      return undefined;
    }
    return { block: true, reason: departureReason(needing) };
  });
}
