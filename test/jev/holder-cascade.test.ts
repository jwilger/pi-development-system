import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJevHolder } from "../../src/jev/holder.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("production holder resolves offline Jev through configured advisor with separate usage", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-cascade-"));
  writeFileSync(join(cwd, ".development-system.toml"), '[models]\nadvisor = ["fake/reasoner"]\n');
  const fake = createFakePi({ cwd, models: [{ id: "fake/reasoner" }] });
  let calls = 0;
  fake.ctx.modelRegistry.complete = async (model, context) => {
    calls++;
    assert.equal(`${model.provider}/${model.id}`, "fake/reasoner");
    assert.doesNotMatch(JSON.stringify(context), /sk-secret-token|session-value/);
    const message = context.messages[0];
    assert.ok(message?.role === "user" && typeof message.content === "string");
    const evidence = JSON.parse(message.content);
    assert.equal(evidence.state.after, "assert.equal(result, 42)");
    assert.equal(evidence.state.nested.contract, "Exact rows remain");
    assert.equal(evidence.questions.q.instructions, "Does it weaken coverage?");
    assert.match(evidence.state.cookie, /redacted/);
    return {
      role: "assistant",
      api: model.api,
      provider: model.provider,
      model: model.id,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "resolved",
            reason: "The operation retains the behavior contract",
            answers: { q: { type: "bool", probability: 0.02 } },
          }),
        },
      ],
      usage: {
        input: 5,
        output: 4,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 9,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };
  };
  const reports: unknown[] = [];
  const holder = createJevHolder({ onReasoningUsage: (usage) => reports.push(usage) });
  let primaryUsage = 0;
  const result = await holder.forContext(fake.ctx).ask(
    {
      contract: "unchanged",
      apiKey: "sk-secret-token",
      command: 'TOKEN="session-value" tool',
      cookie: "Cookie: session=session-value",
      after: "assert.equal(result, 42)",
      nested: { contract: "Exact rows remain" },
    },
    {
      q: {
        type: "bool",
        instructions: "Does it weaken coverage?",
        criteria: { true: "Less coverage", false: "Same coverage" },
      },
    },
    {
      onUsage: () => {
        primaryUsage++;
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(reports.length, 1);
  assert.equal(primaryUsage, 0);
});
