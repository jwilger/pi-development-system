import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { LENSES } from "../../src/core/review.ts";
import { withJevToolUsage } from "../../src/jev/execution.ts";
import { createJevHolder } from "../../src/jev/holder.ts";
import { offlineSession } from "../harness/offline-session.ts";

const usage = {
  input: 5,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 6,
  cost: { input: 0.05, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.06 },
};

function provider(pi: ExtensionAPI, fail = false) {
  pi.registerProvider("typesafe", {
    baseUrl: "https://offline.invalid",
    apiKey: "not-a-real-credential",
    models: [
      {
        type: "classifier",
        id: "jev-latest",
        name: "Offline classifier",
        api: "typesafe-system-one",
        input: ["text"],
        contextWindow: 32000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    classifiers: {
      "typesafe-system-one": {
        async classify(model) {
          return {
            api: model.api,
            provider: model.provider,
            model: model.id,
            timestamp: 0,
            usage,
            stopReason: fail ? "error" : "stop",
            ...(fail ? { errorMessage: "deliberate provider failure" } : {}),
            answers: {
              ...Object.fromEntries(
                LENSES.map((lens) => [lens, { type: "bool" as const, probability: 0.1 }]),
              ),
              own: { type: "bool", probability: 0.1 },
              intent: {
                type: "choice",
                choice: "question",
                confidence: 0.9,
                probabilities: { question: 0.9 },
              },
            },
          };
        },
      },
    },
  });
}

test("real SDK accounts direct and nested classifiers once, caches without rebilling, and excludes hook telemetry", {
  timeout: 10000,
}, async (t) => {
  const host = await offlineSession(
    t,
    (pi) => {
      provider(pi);
      createDevelopmentSystem(pi);
      const holder = createJevHolder();
      pi.registerTool(
        withJevToolUsage({ jev: holder.forContext }, (scoped) => ({
          name: "nested_usage",
          label: "Nested usage",
          description: "Offline usage fixture",
          parameters: Type.Object({}),
          async execute(_id, _params, _signal, _update, ctx) {
            await scoped.jev(ctx).ask(
              { own: true },
              {
                own: {
                  type: "bool",
                  instructions: "fixture",
                  criteria: { true: "yes", false: "no" },
                },
              },
            );
            const args = { diffStat: "fixture", diffSample: "fixture" };
            const first = await ctx.executeTool("judge_lenses", args);
            const cached = await ctx.executeTool("judge_lenses", args);
            assert.equal(first.isError, false);
            assert.equal(cached.isError, false);
            return { content: [{ type: "text", text: "nested complete" }], details: undefined };
          },
        })),
      );
    },
    (_context, request) =>
      request === 0 || request === 2
        ? [{ type: "toolCall", id: `outer-${request}`, name: "nested_usage", arguments: {} }]
        : [],
  );
  await host.session.prompt("Explain the fixture");
  assert.equal(host.session.getSessionStats().tokens.total, 12);
  assert.equal(host.session.getSessionStats().cost, 0.12);
  const telemetry = host.session.sessionManager
    .getEntries()
    .filter((entry) => entry.type === "custom" && entry.customType === "devsys-jev-hook-usage");
  assert.equal(
    telemetry.length,
    1,
    "hook classification is persisted separately from native totals",
  );
  await host.session.prompt("Explain the fixture");
  assert.equal(
    host.session.getSessionStats().tokens.total,
    12,
    "cached direct and nested judgements must not rebill",
  );
  assert.equal(host.session.getSessionStats().cost, 0.12);
  assert.deepEqual(host.errors, []);
});

test("real SDK retains classifier usage on a returned tool error without extension errors", {
  timeout: 10000,
}, async (t) => {
  const host = await offlineSession(
    t,
    (pi) => {
      provider(pi, true);
      createDevelopmentSystem(pi);
      pi.registerTool({
        name: "failed_usage",
        label: "Failed usage",
        description: "Offline returned error fixture",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, ctx) {
          const result = await ctx.executeTool("judge_lenses", {
            diffStat: "fixture",
            diffSample: "fixture",
          });
          return { content: result.result.content, details: undefined, isError: result.isError };
        },
      });
    },
    (_context, request) =>
      request === 0
        ? [{ type: "toolCall", id: "failed", name: "failed_usage", arguments: {} }]
        : [],
  );
  await host.session.prompt("Explain the failure");
  const result = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === "failed",
  );
  assert.ok(result?.role === "toolResult");
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /deliberate provider failure/);
  assert.equal(host.session.getSessionStats().tokens.total, 6);
  assert.equal(host.session.getSessionStats().cost, 0.06);
  assert.deepEqual(host.errors, []);
});
