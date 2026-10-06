import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { isTestPath } from "../core/test-paths.ts";
import {
  applyEdits,
  bashDeletedPaths,
  isPureAddition,
  weakeningSignals,
} from "../core/test-weakening.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeTestChange, WEAKENS_THRESHOLD } from "../jev/questions/test-change.ts";
import type { SessionState } from "../state/session-state.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";

export type TestGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  approvals: ApprovalStore;
  jev: (ctx: ExtensionContext) => Jev;
  now?: () => Date;
};

type Change = { path: string; before: string; after: string | undefined };

type Verdict =
  | { kind: "allow" }
  | { kind: "require-departure"; why: string }
  | { kind: "hard-stop"; why: string };

const GATE_ID = "tests.weaken";

const describeSignals = (
  deleted: boolean,
  signals: { addsSkip: boolean; emptied: boolean },
): string | undefined => {
  if (deleted) return "deletes the test file";
  if (signals.addsSkip) return "skips tests";
  if (signals.emptied) return "empties the test file";
  return undefined;
};

const readIfExists = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

const repoPath = (cwd: string, path: string): string =>
  isAbsolute(path) ? relative(cwd, path) : path;

/**
 * Soft gate `tests.weaken`: deleting, skipping, emptying or loosening tests needs a recorded
 * departure; a change Jev reads as gaming a failing gate escalates to a hard stop.
 */
export function registerTestGuard(deps: TestGuardDeps): void {
  const gate: GateId | undefined = (() => {
    const parsed = parseGateId(GATE_ID);
    return isParseError(parsed) ? undefined : parsed;
  })();
  if (gate === undefined) return;

  const hasOpenDeparture = (): boolean => {
    const { openDepartures, activeSlice } = deps.state.get();
    return openDepartures.some(
      (d) => d.gate === gate && (d.scope.kind !== "slice" || d.scope.slice === activeSlice),
    );
  };

  const consumeOpenDeparture = (): void => {
    const { openDepartures, activeSlice } = deps.state.get();
    const used = openDepartures.find(
      (d) => d.gate === gate && (d.scope.kind !== "slice" || d.scope.slice === activeSlice),
    );
    if (used?.scope.kind !== "once") return;
    deps.state.update((s) => ({
      ...s,
      openDepartures: s.openDepartures.filter((d) => d.id !== used.id),
    }));
  };

  const judge = async (change: Change, ctx: ExtensionContext): Promise<Verdict> => {
    const deleted = change.after === undefined;
    if (!deleted && isPureAddition(change.before, change.after ?? "")) return { kind: "allow" };
    const signals = deleted
      ? { addsSkip: false, emptied: false }
      : weakeningSignals(change.before, change.after ?? "");
    const deterministic = describeSignals(deleted, signals);
    const judged = await judgeTestChange(deps.jev(ctx), {
      path: change.path,
      before: change.before,
      ...(change.after !== undefined ? { after: change.after } : {}),
    });
    if (judged.ok && judged.value.weakens >= WEAKENS_THRESHOLD) {
      return judged.value.motive === "gate-gaming"
        ? {
            kind: "hard-stop",
            why: "Jev reads this change as weakening a check to get a green result",
          }
        : {
            kind: "require-departure",
            why: `Jev reads this change as weakening the tests (motive: ${judged.value.motive})`,
          };
    }
    return deterministic !== undefined
      ? { kind: "require-departure", why: `this change ${deterministic}` }
      : { kind: "allow" };
  };

  deps.pi.on("tool_call", async (event, ctx) => {
    const changes: Change[] = [];
    if (isToolCallEventType("bash", event)) {
      for (const raw of bashDeletedPaths(event.input.command)) {
        const path = repoPath(ctx.cwd, raw);
        if (!isTestPath(path)) continue;
        changes.push({ path, before: readIfExists(join(ctx.cwd, path)) ?? "", after: undefined });
      }
    } else if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const path = repoPath(ctx.cwd, event.input.path);
      if (!isTestPath(path)) return undefined;
      const before = readIfExists(join(ctx.cwd, path));
      if (before === undefined) return undefined;
      const after = isToolCallEventType("write", event)
        ? event.input.content
        : applyEdits(before, event.input.edits);
      changes.push({ path, before, after });
    } else {
      return undefined;
    }

    for (const change of changes) {
      const verdict = await judge(change, ctx);
      if (verdict.kind === "allow") continue;
      if (verdict.kind === "require-departure") {
        if (hasOpenDeparture()) {
          consumeOpenDeparture();
          continue;
        }
        return {
          block: true,
          reason:
            `${GATE_ID}: ${verdict.why} (${change.path}). Tests are the oracle; weakening them needs a ` +
            `recorded decision. If this is deliberate, call devsys_record_departure with gate "${GATE_ID}", ` +
            "what you are doing instead, why, and the cost if wrong; then retry. Otherwise fix the code, not the test.",
        };
      }
      const command = `${isToolCallEventType("bash", event) ? "delete" : "change"} ${change.path}`;
      if (deps.approvals.consume(gate, command)) continue;
      const outcome = await requestHardStop({
        pi: deps.pi,
        ctx,
        gate,
        command,
        why: verdict.why,
        toolCallId: event.toolCallId,
        ...(deps.now !== undefined ? { now: deps.now } : {}),
      });
      if (outcome.kind === "approved") continue;
      return {
        block: true,
        reason:
          outcome.kind === "unavailable"
            ? `hard stop ${GATE_ID}: ${verdict.why} (${change.path}); requires user approval; run interactively`
            : `hard stop ${GATE_ID}: the user declined this change to ${change.path}. Fix the code instead of weakening the test.`,
      };
    }
    return undefined;
  });
}
