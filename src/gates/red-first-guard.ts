import { homedir } from "node:os";
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { classifyPath } from "../core/path-class.ts";
import { normalizeRepoPath } from "../core/test-paths.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { SessionState } from "../state/session-state.ts";
import { departureUse } from "./departure-use.ts";

export type RedFirstGuardDeps = { pi: ExtensionAPI; state: SessionState };

const GATE_ID = "tdd.red-first";

/** Exemption classes a machine cannot see; the departure names which one applies (research 02). */
const JUDGED_EXEMPTIONS =
  "functionality removal, documented third-party behaviour, a change already shown by a failing test, " +
  "straightforward CI scripting, a simple dev-environment utility, or a behaviour-preserving refactor with green coverage";

/**
 * Soft gate `tdd.red-first`: while implementing, production source is edited only after a failing
 * test run has been observed. Test, docs, config and generated files are exempt by path; the
 * judged exemptions go through one recorded departure, which covers its whole slice.
 */
export function registerRedFirstGuard(deps: RedFirstGuardDeps): void {
  const parsed = parseGateId(GATE_ID);
  if (isParseError(parsed)) return;
  const gate: GateId = parsed;
  const departure = departureUse(deps.state, gate);

  deps.pi.on("tool_call", (event, ctx) => {
    if (!isToolCallEventType("edit", event) && !isToolCallEventType("write", event))
      return undefined;
    const { phase, lastTestRun, activeSlice } = deps.state.get();
    if (phase !== "implementing") return undefined;
    if (lastTestRun !== undefined && lastTestRun.exitCode !== 0) return undefined;
    const path = normalizeRepoPath(ctx.cwd, event.input.path, homedir());
    if (classifyPath(path) !== "source") return undefined;
    if (departure.hasOpen()) {
      departure.consume();
      return undefined;
    }
    const seen =
      lastTestRun === undefined
        ? "no test run has been observed in this session"
        : `the last test run passed (${lastTestRun.summary || "exit 0"})`;
    const scope = activeSlice === undefined ? "session" : "slice";
    return {
      block: true,
      reason:
        `${GATE_ID}: ${path} is production source and ${seen}. Write the next failing test first, run it, ` +
        `and watch it fail (RED); then change the source. If this change needs no new failing test (${JUDGED_EXEMPTIONS}), ` +
        `call devsys_record_departure with gate "${GATE_ID}", scope "${scope}", naming the exemption in "why"; one ` +
        `departure covers the rest of the ${scope}.`,
    };
  });
}
