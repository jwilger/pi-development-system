import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createAssistantMessageEventStream, type ToolCall } from "@earendil-works/pi-ai";
import {
  assessElixirTrace,
  type ElixirPlan,
  parseElixirFixture,
  runElixirCase,
} from "../../scripts/lib/elixir-eval.ts";
import { offlineSession } from "../harness/offline-session.ts";

const input: unknown = JSON.parse(
  readFileSync(new URL("../../evals/elixir/mix.json", import.meta.url), "utf8"),
);
const fixture = (() => {
  const parsed = parseElixirFixture(input);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
})();
const call = (id: string, name: string, args: ToolCall["arguments"]): ToolCall => ({
  type: "toolCall",
  id,
  name,
  arguments: args,
});

test("public Elixir SDK runner accepts local commands and tuple core, rejects Result/default commands", async (t) => {
  for (const wrong of [false, true]) {
    const plan: ElixirPlan = {
      ...fixture.expectation,
      ...(wrong ? { errorStyle: "result-class", commands: ["mix test"] } : {}),
    };
    const host = await offlineSession(
      t,
      () => undefined,
      (_context, request) => {
        if (request === 0)
          return fixture.sources.map(({ path }, i) =>
            call(`read-${i}`, "read_repository", { path }),
          );
        if (request === 1) return [call("plan", "submit_elixir_plan", plan)];
        return [];
      },
    );
    const result = await runElixirCase({
      fixture,
      condition: "baseline",
      runtime: host.session.modelRuntime,
      model: host.session.model,
    });
    assert.equal(result.pass, !wrong);
    assert.deepEqual(result.errors, []);
    assert.equal(result.model, "scripted");
    assert.equal(result.provider, "offline-devsys");
    assert.match(result.fixtureHash, /^[a-f0-9]{64}$/);
    assert.match(result.runnerHash, /^[a-f0-9]{64}$/);
    assert.equal(result.trace.plans.length, 1);
    assert.equal(result.trace.plans[0]?.commandEvidence, "NOT EXECUTED");
    assert.deepEqual(result.activeTools.sort(), ["read_repository", "submit_elixir_plan"]);
    host.dispose();
  }
});

async function scripted(
  t: Parameters<typeof offlineSession>[0],
  respond: Parameters<typeof offlineSession>[2],
  selected = fixture,
  condition: "baseline" | "skill" = "baseline",
) {
  const host = await offlineSession(t, () => undefined, respond);
  const result = await runElixirCase({
    fixture: selected,
    condition,
    ...(condition === "skill" ? { skill: "Synthetic skill sentinel" } : {}),
    runtime: host.session.modelRuntime,
    model: host.session.model,
    thinkingLevel: "off",
  });
  host.dispose();
  return result;
}
const reads = () =>
  fixture.sources.map(({ path }, i) => call(`read-${i}`, "read_repository", { path }));
const good = () => call("plan", "submit_elixir_plan", fixture.expectation);

test("unavailable shell/fs/forge tools are denied and retained even before a correct plan", async (t) => {
  for (const name of ["bash", "read", "write", "github", "apply_repository_change"]) {
    const result = await scripted(t, (_context, request) => {
      if (request === 0) return reads();
      if (request === 1)
        return [call("denied", name, { command: "never execute", path: "/etc/passwd" })];
      if (request === 2) return [good()];
      return [];
    });
    assert.equal(result.pass, false);
    assert.equal(result.deniedEffects[0]?.name, name);
    assert.match(JSON.stringify(result.messages), /not found|not available|Unknown tool/i);
  }
});

test("typed decisions reject wrong test scope, logic, dependencies and claimed execution separately", async (t) => {
  for (const changed of [
    { testLevels: ["domain", "browser"] },
    { businessLogic: "liveview" },
    { newDependencies: ["result"] },
    { commandEvidence: "mix test passed" },
    { commandEvidence: "NOT EXECUTED. These commands are only a plan." },
    { commands: [...fixture.expectation.commands, "mix credo"] },
  ]) {
    const result = await scripted(t, (_context, request) => {
      if (request === 0) return reads();
      if (request === 1)
        return [call("plan", "submit_elixir_plan", { ...fixture.expectation, ...changed })];
      return [];
    });
    assert.equal(result.pass, false, JSON.stringify(changed));
  }
});

test("missing reads, invalid arguments and replacement plans cannot yield a passing trace", async (t) => {
  for (const variant of ["unread", "invalid", "replacement"]) {
    const result = await scripted(t, (_context, request) => {
      if (request === 0) return variant === "unread" ? [good()] : reads();
      if (request === 1 && variant === "invalid")
        return [call("invalid", "submit_elixir_plan", { errorStyle: "tuple" })];
      if (request === 1 && variant === "replacement") return [good(), good()];
      return [];
    });
    assert.equal(result.pass, false, variant);
  }
});

test("provider failure after a good plan remains failed with redacted provenance", async (t) => {
  const result = await scripted(t, (_context, request) => {
    if (request === 0) return reads();
    if (request === 1) return [good()];
    throw new Error("API_KEY=example-private-value");
  });
  assert.equal(result.pass, false);
  assert.ok(result.checks.some(({ name, pass }) => name === "provider-success" && !pass));
  const text = JSON.stringify(result);
  assert.ok(!text.includes("example-private-value"));
  assert.ok(text.includes("[redacted]"));
  assert.match(result.runnerHash, /^[a-f0-9]{64}$/);
});

test("bounded repeated reads fail and preserve attempted effects", async (t) => {
  const result = await scripted(t, () => reads());
  assert.equal(result.pass, false);
  assert.equal(result.bounded, true);
  assert.ok(result.turns <= 9);
});

test("harmless ordinary Mix control passes without invented properties, browser or dependencies", async (t) => {
  const parsed = parseElixirFixture(
    JSON.parse(readFileSync(new URL("../../evals/elixir/control.json", import.meta.url), "utf8")),
  );
  assert.ok(!("error" in parsed));
  const result = await scripted(
    t,
    (_context, request) => {
      if (request === 0)
        return parsed.sources.map(({ path }, i) => call(`read-${i}`, "read_repository", { path }));
      if (request === 1) return [call("plan", "submit_elixir_plan", parsed.expectation)];
      return [];
    },
    parsed,
    "skill",
  );
  assert.equal(result.pass, true);
  assert.match(result.skillHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(result.systemPrompt ?? "", /Synthetic skill sentinel/);
});

test("fixture boundary rejects malformed expectations", () => {
  for (const invalid of [
    null,
    {},
    { ...fixture, expectation: {} },
    { ...fixture, expectation: { ...fixture.expectation, commands: "mix test" } },
  ]) {
    assert.deepEqual(parseElixirFixture(invalid), { error: "invalid-elixir-fixture" });
  }
});

test("CLI rejects invalid modes, partial overrides and unavailable models without provider calls", (t) => {
  const root = mkdtempSync(join(tmpdir(), "elixir-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL("../../scripts/eval-elixir.ts", import.meta.url));
  for (const args of [
    [],
    ["--fixture", "mix", "--condition", "both"],
    ["--fixture", "mix", "--provider", "missing"],
    ["--fixture", "mix", "--thinking", "invalid"],
    ["--unknown"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["--experimental-transform-types", "--no-warnings", cli, ...args],
      { encoding: "utf8", timeout: 10000, env: { ...process.env, PI_CODING_AGENT_DIR: root } },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid-eval-arguments/);
  }
  const unavailable = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--no-warnings",
      cli,
      "--fixture",
      "mix",
      "--condition",
      "baseline",
      "--provider",
      "missing",
      "--model",
      "missing",
    ],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, PI_CODING_AGENT_DIR: root } },
  );
  assert.equal(unavailable.status, 1);
  const report = JSON.parse(unavailable.stdout);
  assert.equal(report.pass, false);
  assert.match(report.errors.join(" "), /eval-model-unavailable/);
  assert.match(report.fixtureHash, /^[a-f0-9]{64}$/);
  assert.match(report.cliHash, /^[a-f0-9]{64}$/);
});

test("pure assessment cannot accept a recorded plan without its actual SDK submission", () => {
  const result = assessElixirTrace(
    fixture,
    { reads: fixture.sources.map(({ path }) => path), plans: [fixture.expectation] },
    [],
  );
  assert.equal(result.pass, false);
  assert.deepEqual(
    result.checks.filter(({ pass }) => !pass).map(({ name }) => name),
    ["single-plan"],
  );
});

test("wall-clock timeout aborts an actual pending SDK stream and retains failure provenance", async (t) => {
  const host = await offlineSession(
    t,
    () => undefined,
    () => [],
  );
  const base = host.session.model;
  assert.ok(base);
  host.session.modelRuntime.registerProvider("timeout-devsys", {
    api: "timeout-devsys-api",
    apiKey: "not-a-real-credential",
    baseUrl: "https://offline.invalid",
    models: [
      {
        id: "pending",
        name: "Pending offline",
        reasoning: false,
        input: ["text"],
        contextWindow: 32000,
        maxTokens: 1000,
        cost: base.cost,
      },
    ],
    streamSimple(model, _context, options) {
      const stream = createAssistantMessageEventStream();
      const abort = () =>
        stream.push({
          type: "error",
          reason: "aborted",
          error: {
            role: "assistant",
            api: model.api,
            provider: model.provider,
            model: model.id,
            content: [],
            stopReason: "aborted",
            errorMessage: "offline stream aborted",
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            timestamp: Date.now(),
          },
        });
      if (options?.signal?.aborted) abort();
      else options?.signal?.addEventListener("abort", abort, { once: true });
      return stream;
    },
  });
  const result = await runElixirCase({
    fixture,
    condition: "baseline",
    runtime: host.session.modelRuntime,
    model: host.session.modelRuntime.getModel("timeout-devsys", "pending"),
    timeoutMs: 20,
  });
  assert.equal(result.pass, false);
  assert.equal(result.bounded, true);
  assert.equal(result.provider, "timeout-devsys");
  assert.equal(result.turns, 1);
  assert.ok(result.checks.some(({ name, pass }) => name === "provider-success" && !pass));
  host.dispose();
});

test("CLI preserves configured defaults and refuses existing output before any model call", (t) => {
  const root = mkdtempSync(join(tmpdir(), "elixir-configured-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "settings.json"),
    JSON.stringify({
      defaultProvider: "missing",
      defaultModel: "configured-missing",
      defaultThinkingLevel: "high",
    }),
  );
  const cli = fileURLToPath(new URL("../../scripts/eval-elixir.ts", import.meta.url));
  const args = [
    "--experimental-transform-types",
    "--no-warnings",
    cli,
    "--fixture",
    "control",
    "--condition",
    "baseline",
  ];
  const opts = {
    encoding: "utf8" as const,
    timeout: 10000,
    env: { ...process.env, PI_CODING_AGENT_DIR: root },
  };
  const unavailable = spawnSync(process.execPath, args, opts);
  assert.equal(unavailable.status, 1);
  const report = JSON.parse(unavailable.stdout);
  assert.deepEqual(report.selection, {
    provider: "missing",
    model: "configured-missing",
    thinking: "high",
    explicitModel: false,
  });
  assert.match(report.errors.join(" "), /eval-model-unavailable/);
  const output = join(root, "existing.json");
  writeFileSync(output, "retained evidence");
  const refused = spawnSync(process.execPath, [...args, "--output", output], opts);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /evidence-output-exists/);
  assert.equal(readFileSync(output, "utf8"), "retained evidence");
});

test("submission boundary rejects explanatory command evidence before recording a plan", async (t) => {
  const result = await scripted(t, (_context, request) => {
    if (request === 0) return reads();
    if (request === 1)
      return [
        call("explanatory", "submit_elixir_plan", {
          ...fixture.expectation,
          commandEvidence: "NOT EXECUTED. These commands are only a plan.",
        }),
      ];
    return [];
  });
  assert.equal(result.pass, false);
  assert.equal(result.trace.plans.length, 0);
  assert.ok(Array.isArray(result.messages));
  assert.ok(result.messages.some((message) => message.role === "toolResult" && message.isError));
  assert.ok(result.checks.some(({ name, pass }) => name === "not-executed" && !pass));
});
