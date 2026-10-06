import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type ExtensionAPI,
  isToolCallEventType,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { findUnreasonedSuppressions, MIN_RATIONALE } from "../core/lint-suppression.ts";
import { classifyPath } from "../core/path-class.ts";
import { normalizeRepoPath } from "../core/test-paths.ts";
import { applyEdits, normalizeText } from "../core/test-weakening.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { SessionState } from "../state/session-state.ts";
import { departureUse } from "./departure-use.ts";

export type LintSuppressionGuardDeps = { pi: ExtensionAPI; state: SessionState };

const GATE_ID = "lints.suppression";

const readIfExists = (file: string): string => {
  try {
    return normalizeText(readFileSync(file, "utf8"));
  } catch {
    return "";
  }
};

/** Before/after text of the file an edit or write would produce; `undefined` for other tools. */
function resultingText(
  event: ToolCallEvent,
  cwd: string,
): { path: string; before: string; after: string } | undefined {
  if (!isToolCallEventType("write", event) && !isToolCallEventType("edit", event)) return undefined;
  const path = normalizeRepoPath(cwd, event.input.path, homedir());
  const class_ = classifyPath(path);
  if (class_ !== "source" && class_ !== "test") return undefined;
  const before = readIfExists(join(cwd, path));
  if (isToolCallEventType("write", event)) {
    return { path, before, after: normalizeText(event.input.content) };
  }
  const applied = applyEdits(before, event.input.edits);
  // When the edit text does not match, judge what the agent intends to write on its own.
  return {
    path,
    before: applied === undefined ? "" : before,
    after: applied ?? event.input.edits.map((e) => normalizeText(e.newText)).join("\n"),
  };
}

/**
 * Soft gate `lints.suppression`: a lint or type-check suppression needs a written reason
 * (at least {@link MIN_RATIONALE} characters) or a recorded departure.
 */
export function registerLintSuppressionGuard(deps: LintSuppressionGuardDeps): void {
  const parsed = parseGateId(GATE_ID);
  if (isParseError(parsed)) return;
  const gate: GateId = parsed;
  const departure = departureUse(deps.state, gate);

  deps.pi.on("tool_call", (event, ctx) => {
    const change = resultingText(event, ctx.cwd);
    if (change === undefined) return undefined;
    const found = findUnreasonedSuppressions(change.before, change.after);
    if (found.length === 0) return undefined;
    if (departure.hasOpen()) {
      departure.consume();
      return undefined;
    }
    const list = found.map((s) => `${s.marker} (line ${s.line})`).join(", ");
    return {
      block: true,
      reason:
        `${GATE_ID}: ${change.path} adds a suppression without a reason: ${list}. A suppression hides a ` +
        `finding from every later reader, so it must say why (at least ${MIN_RATIONALE} characters, on the ` +
        `same line or the next, e.g. "// biome-ignore lint/x: boundary parse of foreign JSON"). Add the ` +
        `reason, or fix the finding instead. If a bare suppression is truly right, call ` +
        `devsys_record_departure with gate "${GATE_ID}", what you are doing, why, and the cost if wrong; then retry.`,
    };
  });
}
