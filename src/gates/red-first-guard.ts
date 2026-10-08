import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { afterSourceEdit } from "../core/lifecycle.ts";
import { classifyPath } from "../core/path-class.ts";
import { normalizeRepoPath } from "../core/test-paths.ts";
import type { SessionState } from "../state/session-state.ts";
import { openGate } from "./departure-use.ts";

export type RedFirstGuardDeps = { pi: ExtensionAPI; state: SessionState };

const GATE_ID = "tdd.red-first";

/** Test code written inside a source file (Rust `#[cfg(test)]`/`#[test]`): that edit is the RED step itself. */
const INLINE_TEST = /#\[(?:cfg\(test\)|test|test_case|rstest|proptest|\w+::test)\b/g;

const INLINE_MODULE = /#\[cfg\(test\)\]\s*(?:#\[[^\]]*\]\s*)*mod\s+\w+\s*\{/;

const countInlineTests = (text: string): number => text.match(INLINE_TEST)?.length ?? 0;

const existing = (cwd: string, path: string): string => {
  try {
    return readFileSync(resolve(cwd, path), "utf8");
  } catch {
    return "";
  }
};

type EditInput =
  | { content: string }
  | { edits: ReadonlyArray<{ oldText: string; newText: string }> };

/** Is every edit inside the file's existing `#[cfg(test)]` module? Changing a test's expectation is RED itself. */
const insideTestModule = (edits: ReadonlyArray<{ oldText: string }>, file: string): boolean => {
  // Only an inline module body counts: `mod tests;`, `#[cfg(test)] use ...` and fns are not test code.
  const start = INLINE_MODULE.exec(file)?.index ?? -1;
  return start >= 0 && edits.every((e) => e.oldText !== "" && file.indexOf(e.oldText) > start);
};

/**
 * Does this edit write or change test code? A write counts markers beyond those on disk, an edit
 * counts markers beyond those it replaces (an anchor line is not a new test), or must sit wholly
 * inside the existing test module.
 */
const touchesInlineTest = (input: EditInput, before: () => string): boolean => {
  if ("content" in input) return countInlineTests(input.content) > countInlineTests(before());
  const added = input.edits.reduce(
    (n, e) => n + Math.max(0, countInlineTests(e.newText) - countInlineTests(e.oldText)),
    0,
  );
  return added > 0 || insideTestModule(input.edits, before());
};

/** Exemption classes a machine cannot see; the departure names which one applies (research 02). */
const JUDGED_EXEMPTIONS =
  "functionality removal, documented third-party behaviour, a change already shown by a failing test, " +
  "straightforward CI scripting, a simple dev-environment utility, or a behaviour-preserving refactor with green coverage";

/**
 * Soft gate `tdd.red-first`: while a slice is in flight (implementing, reviewing, delivering), production source is edited only after a failing
 * test run has been observed. Test, docs, config and generated files are exempt by path; the
 * judged exemptions go through one recorded departure, which covers its whole slice.
 */
export function registerRedFirstGuard(deps: RedFirstGuardDeps): void {
  const opened = openGate(deps.state, GATE_ID);
  if (opened === undefined) return;
  const { departure } = opened;

  deps.pi.on("tool_call", (event, ctx) => {
    if (!(isToolCallEventType("edit", event) || isToolCallEventType("write", event)))
      return undefined;
    const { phase, activeSlice } = deps.state.get();
    if (phase !== "implementing" && phase !== "reviewing" && phase !== "delivering")
      return undefined;
    const path = normalizeRepoPath(ctx.cwd, event.input.path, homedir());
    if (classifyPath(path) !== "source") return undefined;
    const { lastTestRun } = deps.state.get();
    if (lastTestRun !== undefined && lastTestRun.exitCode !== 0) return undefined;
    if (touchesInlineTest(event.input, () => existing(ctx.cwd, path))) return undefined;
    if (departure.covers()) return undefined;
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

  // The review covered the code as it was: source that was really written puts the slice back to implementing.
  deps.pi.on("tool_result", (event, ctx) => {
    if (event.isError || (event.toolName !== "edit" && event.toolName !== "write"))
      return undefined;
    if (deps.state.get().phase !== "delivering") return undefined;
    const given = (event.input as { path?: unknown }).path;
    if (typeof given !== "string") return undefined;
    if (classifyPath(normalizeRepoPath(ctx.cwd, given, homedir())) === "source") {
      deps.state.update(afterSourceEdit);
    }
    return undefined;
  });
}
