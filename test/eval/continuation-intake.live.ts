import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { phaseGuide } from "../../src/context/phase-guide.ts";
import { buildPrinciplesSection } from "../../src/context/system-prompt.ts";
import { createReasoningAssessor } from "../../src/jev/reasoning.ts";

const scenarios = [
  [
    "Approved export goal, active implementing slice. Review found missing empty-output behavior required by acceptance. Repair it.",
    "continue",
  ],
  [
    "Approved architecture-policy goal, active slice. Completion auditor found contradictory shipped prompt and unfinished evidence reports. Those violate acceptance. Finish repairs; do not undertake unrelated architecture work.",
    "continue",
  ],
  [
    "Approved export goal, active slice. Verification failed on a required JSON output case. Fix the failing behavior.",
    "continue",
  ],
  [
    "A resumed session has phase idle. Focused goal is still approved export behavior; compacted summary says acceptance evidence report remains unfinished. Resume and finish it.",
    "continue",
  ],
  [
    "After compaction a checkpoint repeats the active goal. No new user request or changed acceptance criteria exists. Tests remain to run.",
    "continue",
  ],
  [
    "Delayed reviewer notification reports a defect in the current slice's acceptance behavior. It arrived after a checkpoint and is not a new user request.",
    "continue",
  ],
  [
    "User requests an unrelated billing feature while an export slice is active. No replacement authorization exists; abandoning current work is a user-owned decision.",
    "ask",
  ],
  [
    "No goal or slice is active. User requests fixing a new login failure. Repository evidence is sufficient to size it.",
    "intake",
  ],
  [
    "Active export goal requires JSON only. User says 'also support all the other formats'. The intended formats and whether this replaces current work are unspecified and cannot be recovered from evidence.",
    "ask",
  ],
  [
    "Active approved export goal. The only uncertainty is Jev classification confidence; acceptance criteria and repository evidence establish that the pending report is required. No scope or authorization decision is missing.",
    "continue",
  ],
  [
    "Active goal has two approved increments. Prior local slice is closed and accepted; user approved proceeding to the next planned increment with its known size. Start that new slice.",
    "intake",
  ],
  [
    "Focused goal text is unavailable after resume. Recent evidence is incomplete and active slice identity alone does not establish scope. Public goal tool and branch evidence can be inspected before deciding.",
    "inspect",
  ],
] as const;

test("shipped intake entry points preserve continuation and user-owned scope boundaries", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../skills/work-intake-and-slicing/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../prompts/devsys-start.md", import.meta.url), "utf8"),
    readFile(new URL("../../prompts/devsys-plan.md", import.meta.url), "utf8"),
  ]);
  const registry = new ModelRegistry(await ModelRuntime.create());
  const assess = createReasoningAssessor({ cwd: process.cwd(), modelRegistry: registry });
  const question = {
    type: "choice" as const,
    instructions:
      "Use the supplied shipped guidance to choose the immediate next action for the scenario. Do not invent missing authorization.",
    criteria: {
      continue:
        "Do the remaining work in the existing approved slice without new intake or renewed user approval.",
      intake: "Call devsys_intake to start genuinely new work or the next approved slice.",
      ask: "Ask the owner for a concrete unresolved scope, replacement or authorization decision.",
      inspect:
        "Recover available active-goal and recent evidence before deciding scope; do not yet intake or ask the user.",
    },
  };
  // Evaluate each conflicting entry point independently, not only a combined prompt whose
  // correct section could hide an unconditional intake instruction elsewhere.
  for (const [index, guidance] of [
    ...sources,
    buildPrinciplesSection(""),
    phaseGuide("idle"),
  ].entries()) {
    for (const [scenario, expected] of scenarios) {
      const result = await assess({ guidance, scenario }, { next: question });
      assert.equal(result.ok, true, `source ${index}: ${scenario}: ${JSON.stringify(result)}`);
      if (!result.ok) continue;
      const answer = result.value.next;
      assert.equal(answer?.type, "choice");
      if (answer?.type === "choice")
        assert.equal(answer.choice, expected, `source ${index}: ${scenario}`);
    }
  }
});
