import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionFactory,
  type ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { serializeDiscoveryEvidence } from "./guidance-eval.ts";

const strings = Type.Array(Type.String({ minLength: 1, maxLength: 1000 }), { maxItems: 12 });
const PlanSchema = Type.Object(
  {
    errorStyle: Type.Union([
      Type.Literal("tagged-tuples"),
      Type.Literal("exceptions"),
      Type.Literal("result-class"),
    ]),
    businessLogic: Type.Union([
      Type.Literal("pure-core"),
      Type.Literal("liveview"),
      Type.Literal("ecto-schema"),
    ]),
    testLevels: Type.Array(
      Type.Union([
        Type.Literal("domain"),
        Type.Literal("property"),
        Type.Literal("liveview"),
        Type.Literal("browser"),
      ]),
      { maxItems: 4 },
    ),
    commands: strings,
    newDependencies: strings,
    commandEvidence: Type.Literal("NOT EXECUTED"),
  },
  { additionalProperties: false },
);
export type ElixirPlan = Static<typeof PlanSchema>;
const FixtureSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 100 }),
    task: Type.String({ minLength: 1, maxLength: 8000 }),
    sources: Type.Array(
      Type.Object({
        path: Type.String({ minLength: 1, maxLength: 200 }),
        content: Type.String({ minLength: 1, maxLength: 8000 }),
      }),
      { minItems: 1, maxItems: 12 },
    ),
    expectation: PlanSchema,
  },
  { additionalProperties: false },
);
export type ElixirFixture = Static<typeof FixtureSchema>;
export type ElixirTrace = { reads: string[]; plans: ElixirPlan[] };
const toolNames = ["read_repository", "submit_elixir_plan"];
export const elixirHash = (text: string) => createHash("sha256").update(text).digest("hex");

export function parseElixirFixture(
  input: unknown,
): ElixirFixture | { error: "invalid-elixir-fixture" } {
  return Value.Check(FixtureSchema, input) ? input : { error: "invalid-elixir-fixture" };
}

const sameSet = (actual: readonly string[], expected: readonly string[]) =>
  actual.length === new Set(actual).size &&
  actual.length === expected.length &&
  expected.every((entry) => actual.includes(entry));

/** Pure structured assessment. No skill text matching and no simulated command execution. */
export function assessElixirTrace(
  fixture: ElixirFixture,
  trace: ElixirTrace,
  messages: readonly AgentMessage[],
) {
  const plan = trace.plans[0];
  const expected = fixture.expectation;
  const calls = messages.flatMap((message) =>
    message.role === "assistant" ? message.content.filter((part) => part.type === "toolCall") : [],
  );
  const deniedEffects = calls.filter((part) => !toolNames.includes(part.name));
  const checks = [
    {
      name: "single-plan",
      pass:
        trace.plans.length === 1 &&
        calls.filter((part) => part.name === "submit_elixir_plan").length === 1,
    },
    {
      name: "read-evidence",
      pass: fixture.sources.every(({ path }) => trace.reads.includes(path)),
    },
    { name: "error-style", pass: plan?.errorStyle === expected.errorStyle },
    { name: "business-logic", pass: plan?.businessLogic === expected.businessLogic },
    {
      name: "test-levels",
      pass: plan !== undefined && sameSet(plan.testLevels, expected.testLevels),
    },
    {
      name: "local-commands",
      pass: plan !== undefined && sameSet(plan.commands, expected.commands),
    },
    {
      name: "no-imposed-dependencies",
      pass: plan !== undefined && sameSet(plan.newDependencies, expected.newDependencies),
    },
    { name: "not-executed", pass: plan?.commandEvidence === "NOT EXECUTED" },
    { name: "sandbox-tools-only", pass: deniedEffects.length === 0 },
    {
      name: "provider-success",
      pass: !messages.some(
        (message) =>
          message.role === "assistant" &&
          ["error", "aborted", "length"].includes(message.stopReason),
      ),
    },
  ];
  return {
    pass: checks.every((check) => check.pass),
    checks,
    trace: structuredClone(trace),
    deniedEffects,
  };
}

const response = (data: unknown) =>
  Promise.resolve({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    details: undefined,
  });
function createElixirEval(fixture: ElixirFixture) {
  const trace: ElixirTrace = { reads: [], plans: [] };
  const extension: ExtensionFactory = (pi) => {
    pi.registerTool({
      name: "read_repository",
      label: "Read synthetic repository",
      description:
        "List synthetic source paths or read one. This is fixture evidence only, never the host filesystem.",
      parameters: Type.Object(
        { path: Type.Optional(Type.String({ maxLength: 200 })) },
        { additionalProperties: false },
      ),
      execute(_id, params) {
        if (params.path === undefined)
          return response({ sources: fixture.sources.map(({ path }) => path) });
        trace.reads.push(params.path);
        return response(
          fixture.sources.find(({ path }) => path === params.path) ?? { error: "source-not-found" },
        );
      },
    });
    pi.registerTool({
      name: "submit_elixir_plan",
      label: "Submit synthetic Elixir plan",
      description:
        "Submit exactly one final structured plan. commands are selected verification commands, never executed. Set commandEvidence to NOT EXECUTED. No code or real resources are changed.",
      parameters: PlanSchema,
      execute(_id, params) {
        trace.plans.push(params);
        return response({ recorded: true, commandEvidence: "NOT EXECUTED" });
      },
    });
  };
  return { extension, trace };
}

type RunOptions = {
  fixture: ElixirFixture;
  condition: "baseline" | "skill";
  skill?: string;
  runtime: ModelRuntime;
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>> | undefined;
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
};

/** A real SDK session; injected runtimes let offline tests exercise the same public runner. */
export async function runElixirCase(options: RunOptions) {
  const { fixture, condition, runtime, model } = options;
  const root = await mkdtemp(join(tmpdir(), "devsys-elixir-eval-"));
  const evaluation = createElixirEval(fixture);
  const errors: string[] = [];
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  let bounded = false;
  let turns = 0;
  let failure: string | null = null;
  const prompt = `${fixture.task}\nThis is a synthetic planning evaluation. Use read_repository for evidence, then submit_elixir_plan once. No filesystem, shell, forge or extension authority exists. Commands are NOT EXECUTED. Do not claim real Elixir verification.`;
  const provenance = {
    case: fixture.id,
    condition,
    fixtureHash: elixirHash(JSON.stringify(fixture)),
    runnerHash: elixirHash(await readFile(new URL(import.meta.url), "utf8")),
    skillHash:
      condition === "skill" && options.skill !== undefined ? elixirHash(options.skill) : null,
  };
  try {
    if (condition === "skill" && !options.skill?.trim())
      throw new Error("elixir-skill-unavailable");
    if (model === undefined) throw new Error("eval-model-unavailable");
    const settings = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const loader = new DefaultResourceLoader({
      cwd: root,
      agentDir: root,
      settingsManager: settings,
      noExtensions: true,
      noSkills: true,
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true,
      disabledBuiltinExtensions: ["mcp"],
      extensionFactories: [evaluation.extension],
      systemPrompt:
        "You are evaluating a synthetic repository. Inspect provided evidence and submit a structured plan. You have no real execution or mutation authority.",
      appendSystemPrompt:
        condition === "skill" && options.skill !== undefined ? [options.skill] : [],
    });
    await loader.reload();
    const created = await createAgentSession({
      cwd: root,
      agentDir: root,
      model,
      modelRuntime: runtime,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      settingsManager: settings,
      tools: toolNames,
      ...(options.thinkingLevel === undefined ? {} : { thinkingLevel: options.thinkingLevel }),
    });
    session = created.session;
    errors.push(...created.extensionsResult.errors.map((error) => error.error));
    const activeSession = session;
    const abort = () => {
      bounded = true;
      activeSession.abort().catch((cause: unknown) => errors.push(String(cause)));
    };
    unsubscribe = session.subscribe((event) => {
      if (event.type === "turn_start" && ++turns > 8) abort();
    });
    timer = setTimeout(abort, Math.min(options.timeoutMs ?? 90_000, 90_000));
    await session.bindExtensions({ onError: (error) => errors.push(error.error) });
    await session.prompt(prompt);
  } catch (cause) {
    failure = "eval-run-failed";
    errors.push(cause instanceof Error ? cause.message : String(cause));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe?.();
  }
  const messages = session?.messages ?? [];
  const assessment = assessElixirTrace(fixture, evaluation.trace, messages);
  // Keep valid JSON even when bounded raw transcript exceeds the evidence budget.
  const raw = serializeDiscoveryEvidence(messages);
  const transcriptTruncated = raw.length > 131072;
  const result = {
    ...provenance,
    ...assessment,
    provider: session?.model?.provider ?? model?.provider ?? null,
    model: session?.model?.id ?? model?.id ?? null,
    thinkingLevel: session?.thinkingLevel ?? options.thinkingLevel ?? null,
    systemPrompt: session?.systemPrompt ?? null,
    prompt,
    activeTools: session?.getActiveToolNames() ?? [],
    pass:
      assessment.pass &&
      errors.length === 0 &&
      !bounded &&
      !transcriptTruncated &&
      failure === null,
    errors,
    failure,
    bounded,
    turns,
    transcriptTruncated,
    messages: transcriptTruncated ? { excerpt: raw.slice(0, 131072) } : messages,
  };
  session?.dispose();
  await rm(root, { recursive: true, force: true });
  // Redact at the public boundary, not only in CLI output. Serializer keeps JSON parseable.
  return JSON.parse(serializeDiscoveryEvidence(result)) as typeof result;
}
