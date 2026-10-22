import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createRouteTaskTool } from "../../src/state/route-task-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const models = (
  JSON.parse(readFileSync("test/fixtures/models/anthropic-only.json", "utf8")) as {
    provider: string;
    id: string;
  }[]
).map((m) => ({ id: `${m.provider}/${m.id}` }));

const pick = (label: string): ClassifierAnswer => ({
  type: "choice",
  choice: label,
  probabilities: { [label]: 1 },
  confidence: 1,
});

const online = (difficulty: string, risk: string): Jev => ({
  ask: async () => ok({ difficulty: pick(difficulty), risk: pick(risk) }),
  availability: () => "online",
  model: () => "fake/jev",
});
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};

const run = (jev: Jev, params: Record<string, unknown>) => {
  const fake = createFakePi({ cwd: mkdtempSync(join(tmpdir(), "devsys-route-")), models });
  const tool = createRouteTaskTool({ jev: () => jev });
  return tool.execute("c", params as never, undefined, undefined, fake.ctx as never);
};

const textOf = (r: { content: readonly { type: string; text?: string }[] }): string =>
  r.content.map((c) => c.text ?? "").join("\n");

test("returns slot, thinking level and a resolved model the coordinator can pass to agent_spawn", async () => {
  const r = await run(online("complex", "high"), { task: "migrate the schema", files: ["m.sql"] });
  assert.notEqual(r.isError, true);
  assert.match(textOf(r), /complex\/high/);
  assert.match(textOf(r), /"model":"anthropic\//);
  assert.match(textOf(r), /thinkingLevel/);
});

test("Jev offline routes as routine/low and says so", async () => {
  const r = await run(offline, { task: "do a thing" });
  assert.notEqual(r.isError, true);
  assert.match(textOf(r), /routine\/low/);
  assert.match(textOf(r), /Jev unavailable/i);
});

test("an empty task is an error", async () => {
  const r = await run(online("trivial", "low"), { task: "  " });
  assert.equal(r.isError, true);
});

test("files too large for a small-window model route past it and the reply says why", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-route-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    '[models]\nfast = ["local/coder-*", "anthropic/claude-haiku-*"]\n',
  );
  writeFileSync(join(cwd, "small.ts"), "export const a = 1;\n");
  writeFileSync(join(cwd, "big.ts"), "x".repeat(60_000));
  const fake = createFakePi({
    cwd,
    models: [
      { id: "local/coder-30", contextWindow: 32_768 },
      { id: "anthropic/claude-haiku-5-5", contextWindow: 1_000_000 },
    ],
  });
  const tool = createRouteTaskTool({ jev: () => online("trivial", "low") });
  const go = (files: string[]) =>
    tool.execute(
      "c",
      { task: "rename a", files } as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
  const small = textOf(await go(["small.ts"]));
  assert.match(small, /"model":"local\/coder-30"/);
  const big = textOf(await go(["big.ts"]));
  assert.match(big, /"model":"anthropic\/claude-haiku-5-5"/);
  assert.match(big, /skipped local\/coder-30 \(32768-token window\)/);
});

test("a named file that does not exist adds nothing to the estimate", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-route-"));
  writeFileSync(join(cwd, ".development-system.toml"), '[models]\nfast = ["local/coder-*"]\n');
  const fake = createFakePi({ cwd, models: [{ id: "local/coder-30", contextWindow: 32_768 }] });
  const tool = createRouteTaskTool({ jev: () => online("trivial", "low") });
  const r = await tool.execute(
    "c",
    { task: "add a file", files: ["new/thing.ts"] } as never,
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.match(textOf(r), /"model":"local\/coder-30"/);
});
