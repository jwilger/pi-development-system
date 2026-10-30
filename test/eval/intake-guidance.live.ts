import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createReasoningAssessor } from "../../src/jev/reasoning.ts";

test("published intake guidance routes uncertainty to reasoning but preserves replacement consent", async () => {
  const guidance = await Promise.all([
    readFile(new URL("../../skills/work-intake-and-slicing/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../prompts/devsys-start.md", import.meta.url), "utf8"),
  ]);
  const registry = new ModelRegistry(await ModelRuntime.create());
  const assess = createReasoningAssessor({ cwd: process.cwd(), modelRegistry: registry });
  const question = {
    type: "choice" as const,
    instructions:
      "Following the supplied intake guidance, choose the next action for this scenario.",
    criteria: {
      reasoning:
        "Inspect evidence and use configured LLM reasoning or an evidence-backed explicit size; do not ask the user merely to classify uncertain work.",
      consent:
        "Ask the user to approve replacing active work because this is a user-owned decision, not classifier uncertainty.",
    },
  };
  const scenarios: readonly (readonly [string, string])[] = [
    [
      "A clear request fixes an existing error. Jev sizing has confidence 0.21; no active slice exists. The only issue is classifier uncertainty.",
      "reasoning",
    ],
    [
      "Sizing is confidently decided, but starting the new work would discard an existing active slice. Replacement has not been authorized.",
      "consent",
    ],
  ];
  for (const [scenario, expected] of scenarios) {
    const result = await assess({ guidance, scenario }, { next: question });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) continue;
    const answer = result.value.next;
    assert.equal(answer?.type, "choice");
    if (answer?.type === "choice") assert.equal(answer.choice, expected);
  }
});
