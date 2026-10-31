import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type ToolCall,
} from "@earendil-works/pi-ai";
import {
  ARCHITECTURE_CASES,
  createArchitectureEval,
  createArchitectureRuntime,
  runArchitectureCell,
} from "../../scripts/lib/architecture-eval.ts";
import { ARCHITECTURE_POLICY } from "../../src/core/architecture-policy.ts";
import { offlineSession } from "../harness/offline-session.ts";

const decisions = [
  ["valid-pairing", "proceed"],
  ["empty-update", "revise"],
  ["cosmetic-update", "revise"],
  ["missing-update", "revise"],
  ["self-contained", "proceed"],
  ["backlinks", "revise"],
  ["source-table", "revise"],
  ["delegated-requirements", "revise"],
  ["merged-correction", "revise"],
  ["merged-deletion", "revise"],
  ["merged-renaming", "revise"],
  ["merged-reintroduction", "revise"],
  ["significant-decision", "revise"],
  ["routine-choice", "proceed"],
  ["product-decision", "proceed"],
  ["linked-supersession", "proceed"],
  ["supersession-with-rewrite", "revise"],
  ["premerge-paired", "proceed"],
  ["premerge-unpaired", "revise"],
  ["multiple-additions", "revise"],
  ["squash-multiple", "revise"],
  ["squash-lost-update", "revise"],
  ["squash-lost-replacement", "revise"],
  ["split-delivery", "proceed"],
  ["rejected-unchanged", "revise"],
  ["rejected-changed", "proceed"],
  ["bootstrap-sequential", "proceed"],
  ["bootstrap-batch", "revise"],
  ["bootstrap-retrofit", "revise"],
  ["prospective-migration", "proceed"],
  ["legacy-rewrite", "revise"],
  ["consumer-no-consent", "ask-owner"],
  ["unknown-history", "ask-owner"],
  ["omitted-pending", "ask-owner"],
  ["unknown-authority", "ask-owner"],
  ["intent-as-evidence", "revise"],
] as const;
async function runnerHost(
  t: import("node:test").TestContext,
  mode: "answer" | "loop" | "wait" | "error" = "answer",
) {
  const root = await mkdtemp(join(tmpdir(), "architecture-eval-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = await createArchitectureRuntime({
    credentials: new InMemoryCredentialStore(),
    modelsStorePath: join(root, "models.json"),
  });
  let requests = 0;
  // Additive provider-input evidence for workflow expansion; existing assertions remain unchanged.
  const contexts: string[] = [];
  runtime.registerProvider("architecture-offline", {
    api: "architecture-offline-api",
    apiKey: "synthetic-not-a-secret",
    baseUrl: "https://offline.invalid",
    models: [
      {
        id: "selected",
        name: "Selected offline",
        reasoning: false,
        input: ["text"],
        contextWindow: 32000,
        maxTokens: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    streamSimple(model, context, options) {
      contexts.push(JSON.stringify(context.messages));
      const request = requests++;
      const stream = createAssistantMessageEventStream();
      const content =
        (mode === "loop" && request < 4) || request === 0
          ? [answerCall("proceed")]
          : [{ type: "text" as const, text: "done" }];
      const completionReason =
        content[0]?.type === "toolCall" ? ("toolUse" as const) : ("stop" as const);
      const message = {
        role: "assistant" as const,
        api: model.api,
        provider: model.provider,
        model: model.id,
        content,
        stopReason: mode === "error" ? ("error" as const) : completionReason,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        timestamp: Date.now(),
      };
      if (mode === "wait") {
        options?.signal?.addEventListener(
          "abort",
          () => {
            stream.push({
              type: "error",
              reason: "aborted",
              error: { ...message, stopReason: "aborted" },
            });
          },
          { once: true },
        );
      } else if (mode === "error")
        stream.push({
          type: "error",
          reason: "error",
          error: { ...message, errorMessage: "synthetic-provider-error" },
        });
      else {
        stream.push({ type: "start", partial: message });
        stream.push({
          type: "done",
          reason: content[0]?.type === "toolCall" ? "toolUse" : "stop",
          message,
        });
      }
      return stream;
    },
  });
  return { root, runtime, contexts, requests: () => requests };
}

const answerCall = (decision: string): ToolCall => ({
  type: "toolCall",
  id: "answer",
  name: "architecture_answer",
  arguments: {
    decision,
    explanation: "Synthetic response; explanations are retained, not semantically graded.",
  },
});

async function exercise(t: import("node:test").TestContext, caseName: string, decision: string) {
  const evaluation = createArchitectureEval(caseName, "guidance");
  const host = await offlineSession(t, evaluation.extension, (_context, request) =>
    request === 0 ? [answerCall(decision)] : [],
  );
  await host.session.prompt(evaluation.prompt);
  return { ...evaluation.assess(host.session.messages), errors: host.errors };
}

test("a real SDK answer permitting a cosmetic-only architecture pairing fails assessment", async (t) => {
  const result = await exercise(t, "cosmetic-update", "proceed");
  assert.deepEqual(result.errors, []);
  assert.equal(result.answers.length, 1, "the real typed answer tool ran");
  assert.equal(result.pass, false, "cosmetic edits do not substantively pair the new ADR");
});

test("unambiguous scenario decisions pass, and forbidden alternatives fail through the SDK", async (t) => {
  assert.deepEqual(
    ARCHITECTURE_CASES,
    decisions.map(([caseName]) => caseName),
  );
  for (const [caseName, decision] of decisions) {
    const valid = await exercise(t, caseName, decision);
    assert.deepEqual(valid.errors, []);
    assert.equal(valid.pass, true, caseName);
    const invalid = await exercise(t, caseName, decision === "proceed" ? "revise" : "proceed");
    assert.deepEqual(invalid.errors, []);
    assert.equal(invalid.pass, false, `${caseName}: forbidden decision`);
  }
});

test("guidance reaches actual provider requests and continuations; baseline differs only by policy", async (t) => {
  const prompts: string[] = [];
  for (const condition of ["baseline", "guidance"] as const) {
    const evaluation = createArchitectureEval("cosmetic-update", condition);
    prompts.push(evaluation.prompt);
    const requests: string[] = [];
    const host = await offlineSession(t, evaluation.extension, (context, request) => {
      requests.push(
        JSON.stringify(context.messages.filter((message) => message.role === "system")),
      );
      return request === 0 ? [answerCall("revise")] : [];
    });
    await host.session.prompt(evaluation.prompt);
    assert.equal(evaluation.assess(host.session.messages).pass, true);
    assert.equal(requests.length, 2, "answer plus automatic continuation");
    for (const request of requests) {
      assert.equal(
        request.includes(JSON.stringify(ARCHITECTURE_POLICY.trim()).slice(1, -1)),
        condition === "guidance",
      );
      assert.equal(request.includes("expected-decision"), false, "oracle is not model context");
    }
    assert.deepEqual(host.session.getActiveToolNames(), ["architecture_answer"]);
  }
  assert.equal(prompts[0], prompts[1], "same facts and task in both conditions");
});

test("a valid answer cannot erase unsafe, malformed, duplicate or failed provider observations", async (t) => {
  const invalidCalls: ToolCall[] = [
    {
      type: "toolCall",
      id: "unsafe",
      name: "write",
      arguments: { path: "/tmp/not-authorized", content: "bad" },
    },
    {
      type: "toolCall",
      id: "unsafe",
      name: "architecture_answer",
      arguments: { decision: "proceed", explanation: "" },
    },
    {
      type: "toolCall",
      id: "unsafe",
      name: "architecture_answer",
      arguments: { decision: "proceed", explanation: "ok", unexpected: true },
    },
    {
      type: "toolCall",
      id: "unsafe",
      name: "architecture_answer",
      arguments: { decision: "invented", explanation: "bad" },
    },
    { type: "toolCall", id: "unsafe", name: "architecture_answer", arguments: {} },
    answerCall("proceed"),
  ];
  for (const invalid of invalidCalls) {
    const evaluation = createArchitectureEval("valid-pairing", "guidance");
    const host = await offlineSession(t, evaluation.extension, (_context, request) =>
      request === 0 ? [invalid, { ...answerCall("proceed"), id: "valid" }] : [],
    );
    await host.session.prompt(evaluation.prompt);
    assert.equal(evaluation.assess(host.session.messages).pass, false, JSON.stringify(invalid));
  }
  for (const failProvider of [false, true]) {
    const evaluation = createArchitectureEval("valid-pairing", "guidance");
    const host = await offlineSession(t, evaluation.extension, (_context, request) => {
      if (!failProvider) return [];
      if (request === 0) return [answerCall("proceed")];
      throw new Error("synthetic-provider-failure API_KEY=example-secret-value");
    });
    await host.session.prompt(evaluation.prompt);
    assert.equal(
      evaluation.assess(host.session.messages).pass,
      false,
      "missing answer or provider error cannot pass",
    );
  }
});

test("runtime initialization discovers existing local models and credentials without catalog network access", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "architecture-existing-models-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modelsPath = join(root, "models.json");
  const authPath = join(root, "auth.json");
  await writeFile(
    modelsPath,
    JSON.stringify({
      providers: {
        "architecture-configured": {
          baseUrl: "https://offline.invalid/v1",
          api: "openai-completions",
          models: [{ id: "existing" }],
        },
      },
    }),
    { mode: 0o600 },
  );
  await writeFile(
    authPath,
    JSON.stringify({
      "architecture-configured": { type: "api_key", key: "synthetic-not-a-secret" },
    }),
    { mode: 0o600 },
  );
  const runtime = await createArchitectureRuntime({
    modelsPath,
    authPath,
    modelsStorePath: join(root, "models-store.json"),
  });
  assert.equal(
    runtime
      .getAvailableSnapshot()
      .some((model) => model.provider === "architecture-configured" && model.id === "existing"),
    true,
    "existing local configuration and credentials must be initialized, not hidden behind an empty availability snapshot",
  );
});

test("the bounded host uses exactly the explicit available SDK model", async (t) => {
  const host = await runnerHost(t);
  const result = await runArchitectureCell({
    ...host,
    evaluation: createArchitectureEval("valid-pairing", "guidance"),
    provider: "architecture-offline",
    modelId: "selected",
  });
  assert.equal(result.pass, true, JSON.stringify(result));
  assert.deepEqual(result.effective, { provider: "architecture-offline", model: "selected" });
  assert.equal(host.requests(), 2);
  assert.equal(result.turns, 2);
  assert.equal(result.bounded, false);
});

test("turn/time bounds, provider errors and unavailable explicit models fail closed without retries", async (t) => {
  const looping = await runnerHost(t, "loop");
  const bounded = await runArchitectureCell({
    ...looping,
    evaluation: createArchitectureEval("valid-pairing", "guidance"),
    provider: "architecture-offline",
    modelId: "selected",
    limits: { turns: 2, milliseconds: 1000 },
  });
  assert.equal(bounded.bounded, true, "a continuing provider is stopped at the turn limit");
  assert.equal(bounded.pass, false);
  assert.equal(looping.requests(), 2);

  const waiting = await runnerHost(t, "wait");
  const timed = await runArchitectureCell({
    ...waiting,
    evaluation: createArchitectureEval("valid-pairing", "guidance"),
    provider: "architecture-offline",
    modelId: "selected",
    limits: { turns: 2, milliseconds: 30 },
  });
  assert.equal(timed.bounded, true);
  assert.equal(timed.pass, false);
  assert.equal(waiting.requests(), 1);

  const failing = await runnerHost(t, "error");
  const failed = await runArchitectureCell({
    ...failing,
    evaluation: createArchitectureEval("valid-pairing", "guidance"),
    provider: "architecture-offline",
    modelId: "selected",
  });
  assert.equal(failed.pass, false);
  assert.equal(failing.requests(), 1, "automatic retry disabled");

  const unavailable = await runnerHost(t);
  await assert.rejects(
    runArchitectureCell({
      ...unavailable,
      evaluation: createArchitectureEval("valid-pairing", "guidance"),
      provider: "architecture-offline",
      modelId: "not-selected",
    }),
    /explicit model or credentials unavailable; no fallback selected/,
  );
  assert.equal(unavailable.requests(), 0);
  for (const limits of [
    { turns: 0, milliseconds: 30 },
    { turns: 13, milliseconds: 30 },
    { turns: 2, milliseconds: Number.NaN },
    { turns: 2, milliseconds: 90_001 },
  ]) {
    await assert.rejects(
      runArchitectureCell({
        ...unavailable,
        evaluation: createArchitectureEval("valid-pairing", "guidance"),
        provider: "architecture-offline",
        modelId: "selected",
        limits,
      }),
      /invalid-architecture-eval-limits/,
    );
  }
  assert.equal(unavailable.requests(), 0, "invalid limits never contact a provider");
});

test("workflow evaluation expands a real pi prompt template before the provider sees the scenario", async (t) => {
  const host = await runnerHost(t);
  const workflowPrompt = join(host.root, "devsys-start.md");
  await writeFile(
    workflowPrompt,
    "---\ndescription: Synthetic workflow\n---\nWorkflow-input-marker: $ARGUMENTS\n",
  );
  const evaluation = createArchitectureEval("valid-pairing", "guidance");
  const result = await runArchitectureCell({
    ...host,
    evaluation,
    provider: "architecture-offline",
    modelId: "selected",
    workflowPrompt,
  });
  assert.equal(result.pass, true);
  assert.match(host.contexts[0] ?? "", /Workflow-input-marker:/);
  assert.ok((host.contexts[0] ?? "").includes(evaluation.prompt.split("\n")[0] ?? ""));
  assert.equal((host.contexts[0] ?? "").includes("$ARGUMENTS"), false);
});

test("live CLI requires explicit selections, reserves immutable private evidence, and records unavailable models", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "architecture-eval-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const invoke = (cliArgs: string[]) =>
    spawnSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--no-warnings",
        "scripts/eval-architecture.ts",
        ...cliArgs,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
  const missing = invoke([]);
  assert.equal(missing.status, 1, "missing explicit selections must not succeed");
  assert.match(missing.stderr, /explicit --provider --model --output --case --condition/);
  const output = join(root, "evidence.json");
  const args = [
    "--provider",
    "architecture-does-not-exist",
    "--model",
    "explicit-missing",
    "--output",
    output,
    "--case",
    "cosmetic-update",
    "--condition",
    "guidance",
  ];
  const unavailable = invoke(args);
  assert.equal(unavailable.status, 1);
  const evidence = JSON.parse(await readFile(output, "utf8"));
  assert.equal(evidence.pass, false);
  assert.equal(evidence.result, null);
  assert.match(evidence.error, /explicit model or credentials unavailable; no fallback selected/);
  assert.equal(evidence.requested.provider, "architecture-does-not-exist");
  assert.equal(evidence.fixture.id, "cosmetic-update");
  assert.match(evidence.policy.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(evidence.sources["scripts/lib/architecture-eval.ts"], /^[a-f0-9]{64}$/);
  assert.equal(evidence.limits.turns, 12);
  assert.equal(evidence.limits.milliseconds, 90_000);
  assert.equal((await stat(output)).mode & 0o777, 0o400);
  const original = await readFile(output, "utf8");
  assert.equal(invoke(args).status, 1, "no overwrites");
  assert.equal(await readFile(output, "utf8"), original);
  const workflowOutput = join(root, "workflow.json");
  const workflowArgs = args.map((arg) => (arg === output ? workflowOutput : arg));
  const workflowResult = invoke([...workflowArgs, "--workflow-prompt", "devsys-start"]);
  assert.match(
    workflowResult.stdout,
    /"pass":false/,
    "workflow evaluation must reserve evidence before model discovery",
  );
  const workflowEvidence = JSON.parse(await readFile(workflowOutput, "utf8"));
  assert.equal(workflowEvidence.workflow.source, "prompts/devsys-start.md");
  assert.match(workflowEvidence.workflow.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(workflowEvidence.error, /explicit model or credentials unavailable/);
  const marker = join(root, "unrelated.txt");
  await writeFile(marker, "preserved");
  assert.equal(await readFile(marker, "utf8"), "preserved");
});
