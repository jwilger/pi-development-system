import assert from "node:assert/strict";
import test from "node:test";
import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { LENSES } from "../../src/core/review.ts";
import { createJev } from "../../src/jev/client.ts";
import { withJevToolUsage } from "../../src/jev/execution.ts";
import { createJevHolder } from "../../src/jev/holder.ts";
import { createJudgeTools } from "../../src/jev/judge-tools.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const usage: Usage = {
  input: 12,
  output: 3,
  cacheRead: 2,
  cacheWrite: 1,
  cacheWrite1h: 1,
  reasoning: 2,
  totalTokens: 18,
  cost: { input: 0.12, output: 0.03, cacheRead: 0.02, cacheWrite: 0.01, total: 0.18 },
};

const setup = () => {
  const fake = createFakePi({
    classifiers: ["typesafe/jev-latest"],
    classifyAnswers: Object.fromEntries(
      LENSES.map((lens) => [lens, { type: "bool", probability: 0.2 }]),
    ),
    classifyUsage: usage,
  });
  const holder = createJevHolder();
  const tool = createJudgeTools({ jev: (ctx) => holder.forContext(ctx) }).find(
    (t) => t.name === "judge_lenses",
  );
  const context = {
    ...fake.ctx,
    tools: [],
    executeTool: async () => {
      throw new Error("Unexpected nested call in the judge fixture");
    },
  };
  return { fake, tool, ctx: context };
};

test("a judge tool accounts a real request but never rebills its cached answer", async () => {
  const { fake, tool, ctx } = setup();
  assert.ok(tool);
  const params = { diffStat: "src/a.ts", diffSample: "a change" };
  const first = await tool.execute("first", params, undefined, undefined, ctx);
  assert.equal(first.isError, false);
  assert.deepEqual(first.usage, usage);
  const cached = await tool.execute("cached", params, undefined, undefined, ctx);
  assert.deepEqual(cached.content, first.content);
  assert.equal(cached.usage, undefined);
  assert.equal(fake.classifyCalls.count, 1);
});

test("a tool aggregates all direct classifier requests without losing optional breakdowns", async () => {
  const { fake, ctx } = setup();
  const holder = createJevHolder();
  const tool = withJevToolUsage(
    { jev: (context: ExtensionContext) => holder.forContext(context) },
    (scoped) => ({
      name: "two_judgements",
      label: "Two judgements",
      description: "Fixture",
      parameters: Type.Object({}),
      async execute() {
        const questions = {
          q: { type: "bool" as const, instructions: "?", criteria: { true: "yes", false: "no" } },
        };
        await scoped.jev(ctx).ask({ request: "one" }, questions);
        await scoped.jev(ctx).ask({ request: "two" }, questions);
        return { content: [], details: undefined };
      },
    }),
  );
  const result = await tool.execute("both", {}, undefined, undefined, ctx);
  assert.equal(result.usage?.totalTokens, 36);
  assert.equal(result.usage?.cost.total, 0.36);
  assert.equal(result.usage?.reasoning, 4);
  assert.equal(result.usage?.cacheWrite1h, 2);
  assert.equal(fake.classifyCalls.count, 2);
});

test("a cancelled judge invocation returns aborted without starting or rebilling a request", async () => {
  const { fake, tool, ctx } = setup();
  assert.ok(tool);
  const controller = new AbortController();
  controller.abort();
  const result = await tool.execute(
    "cancelled",
    { diffStat: "src/a.ts", diffSample: "changed" },
    controller.signal,
    undefined,
    ctx,
  );
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /aborted/);
  assert.equal(result.usage, undefined);
  assert.equal(fake.classifyCalls.count, 0);
});

test("a judge caller abort interrupts the provider without cross-cancelling another invocation", async () => {
  const { fake, ctx } = setup();
  let started = 0;
  const pendingSignals: AbortSignal[] = [];
  const jev = createJev({
    registry: {
      findOfType: fake.ctx.modelRegistry.findOfType.bind(fake.ctx.modelRegistry),
      hasConfiguredAuth: () => true,
      classify: async (_model, _context, options) => {
        started++;
        if (options?.signal) pendingSignals.push(options.signal);
        return new Promise(() => undefined);
      },
    },
    candidates: ["typesafe/jev-latest"],
    timeoutMs: 30,
    cache: new Map(),
    now: () => 0,
  });
  const tool = createJudgeTools({ jev: () => jev }).find(
    (candidate) => candidate.name === "judge_lenses",
  );
  assert.ok(tool);
  const caller = new AbortController();
  const first = tool.execute(
    "first",
    { diffStat: "one", diffSample: "changed" },
    caller.signal,
    undefined,
    ctx,
  );
  const second = tool.execute(
    "second",
    { diffStat: "two", diffSample: "changed" },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(started, 2);
  caller.abort();
  assert.match(JSON.stringify((await first).content), /aborted/);
  assert.equal(pendingSignals[0]?.aborted, true);
  assert.equal(pendingSignals[1]?.aborted, false);
  assert.match(JSON.stringify((await second).content), /timeout/);
});
