import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createReasoningAssessor } from "../../src/jev/reasoning.ts";

// Opt-in model evidence, not a committed-text test or proof of actual agent execution.
test("published review guidance isolates lenses and refuses partial clean rounds", async () => {
  const guidance = await Promise.all([
    readFile(new URL("../../skills/code-review/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../../prompts/devsys-review.md", import.meta.url), "utf8"),
    readFile(new URL("../../agents/reviewer.md", import.meta.url), "utf8"),
  ]);
  const registry = new ModelRegistry(await ModelRuntime.create());
  const assess = createReasoningAssessor({ cwd: process.cwd(), modelRegistry: registry });
  const criteria = {
    fanout:
      "Spawn each returned payload unchanged as its own fresh reviewer session, launch every sibling before waiting, wait for all, and record their results together using the original scope and identity.",
    combined:
      "Spawn one reviewer session with all selected lenses assigned together, then record its result.",
    partial:
      "Record the available clean lens results now, treating a failed or absent lens as having no findings.",
    recover:
      "Keep available results and wait for or retry only the missing or failed assigned reviewer; do not record a round until all selected lenses return valid results.",
    duplicate:
      "Restart the review and spawn all returned paths again, even when their sessions already exist.",
    inspect:
      "Review the missing lens in the coordinator conversation and supply a clean packet to finish the round.",
  };
  const scenarios: readonly (readonly [string, keyof typeof criteria])[] = [
    [
      "A new review round selects types and tests. Start returns an array of two reviewer payloads with distinct top-level paths, wait:false, the same diff digest, and exactly one assigned lens each. No session exists yet. Choose the next orchestration action.",
      "fanout",
    ],
    [
      "A new round selects only security. Start returns an array containing one reviewer payload with wait:false. No session exists yet. Choose the next orchestration action.",
      "fanout",
    ],
    [
      "The types session submitted no findings. The tests session failed before submitting. A partial result is available, but the round selected both types and tests. Choose the next action.",
      "recover",
    ],
    [
      "Both selected reviewer sessions already exist. One is still running and the other submitted a clean result. A repeated start says the same round is already prepared and returns the original handoff. Choose the next action.",
      "recover",
    ],
  ];
  for (const [scenario, expected] of scenarios) {
    const result = await assess(
      { guidance, scenario },
      {
        next: {
          type: "choice",
          instructions: "Choose the next action required by the supplied review guidance.",
          criteria,
        },
      },
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) continue;
    const answer = result.value.next;
    assert.equal(answer?.type, "choice");
    if (answer?.type === "choice") assert.equal(answer.choice, expected, scenario);
  }
});
