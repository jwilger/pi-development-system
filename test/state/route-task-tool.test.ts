import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
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
