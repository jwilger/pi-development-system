import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerSpawnGuard } from "../../src/gates/spawn-guard.ts";
import { createFakePi } from "../harness/fake-pi.ts";

// Built in pieces so this file never carries a credential-shaped literal itself.
const TOKEN = `ghp_${"a1B2".repeat(9)}`;

const setup = (toml?: string) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-spawn-"));
  if (toml !== undefined) writeFileSync(join(cwd, ".development-system.toml"), toml);
  const fake = createFakePi({ cwd, models: [{ id: "acme/big-2" }, { id: "acme/small-1" }] });
  registerSpawnGuard({ pi: fake.api });
  const spawn = async (input: Record<string, unknown>) => {
    const event = { type: "tool_call", toolName: "agent_spawn", toolCallId: "c1", input };
    const result = (await fake.emit(event as never)) as
      | { block: boolean; reason: string }
      | undefined;
    return { result, input };
  };
  return { spawn };
};

test("an agent_spawn with no model gets its slot's model from the project's [models]", async () => {
  const { spawn } = setup('[models]\nreviewer = ["acme/big-*"]\n');
  const { result, input } = await spawn({ path: "/r", type: "reviewer", task: "look" });
  assert.equal(result, undefined);
  assert.equal(input.model, "acme/big-2");
});

test("a model the coordinator chose is never replaced", async () => {
  const { spawn } = setup('[models]\nreviewer = ["acme/big-*"]\n');
  const { input } = await spawn({ path: "/r", type: "reviewer", task: "t", model: "acme/small-1" });
  assert.equal(input.model, "acme/small-1");
});

test("without a configured slot the agent type keeps its own models", async () => {
  const { spawn } = setup();
  const { input } = await spawn({ path: "/r", type: "reviewer", task: "t" });
  assert.equal("model" in input, false);
});

test("a task that carries a credential is refused, naming the kind and never the value", async () => {
  const { spawn } = setup();
  const { result } = await spawn({ path: "/r", type: "researcher", task: `use ${TOKEN} to fetch` });
  assert.equal(result?.block, true);
  assert.match(result?.reason ?? "", /a GitHub token/);
  assert.doesNotMatch(result?.reason ?? "", new RegExp(TOKEN));
});

test("other tools are ignored", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-spawn-"));
  const fake = createFakePi({ cwd });
  registerSpawnGuard({ pi: fake.api });
  const event = { type: "tool_call", toolName: "bash", toolCallId: "c", input: { command: TOKEN } };
  assert.equal(await fake.emit(event as never), undefined);
});

test("an agent_steer message that carries a credential is refused, with no value in the reason", async () => {
  const fake = createFakePi({ cwd: mkdtempSync(join(tmpdir(), "devsys-steer-")) });
  registerSpawnGuard({ pi: fake.api });
  const steer = (message: string) =>
    fake.emit({
      type: "tool_call",
      toolName: "agent_steer",
      toolCallId: "c1",
      input: { path: "/r", message },
    } as never) as Promise<{ block: boolean; reason: string } | undefined>;
  const refused = await steer(`use ${TOKEN}`);
  assert.equal(refused?.block, true);
  assert.match(refused?.reason ?? "", /a GitHub token/);
  assert.doesNotMatch(refused?.reason ?? "", new RegExp(TOKEN));
  assert.equal(await steer("carry on"), undefined);
});
