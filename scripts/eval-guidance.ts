/** Opt-in model evidence. Ordinary npm test never invokes a live provider. */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "../src/core/redact.ts";
import {
  createDiscoveryEval,
  type DiscoveryFixture,
  parseDiscoveryFixture,
  serializeDiscoveryEvidence,
} from "./lib/guidance-eval.ts";

const cases = new Map([
  ["discovery-conflict", "conflict.json"],
  ["discovery-consistent", "consistent.json"],
  ["discovery-inaccessible", "inaccessible.json"],
]);
const hash = (content: string) => createHash("sha256").update(content).digest("hex");
const failure = (error: string, cause?: unknown) => ({
  pass: false as const,
  error,
  ...(cause === undefined
    ? {}
    : { message: redactSecrets(cause instanceof Error ? cause.message : String(cause)) }),
});

async function loadFixture(caseFile: string) {
  try {
    const text = await readFile(
      new URL(`../evals/guidance/discovery/${caseFile}`, import.meta.url),
      "utf8",
    );
    const raw: unknown = JSON.parse(text);
    const fixture = parseDiscoveryFixture(raw);
    return "error" in fixture ? failure(fixture.error) : { fixture, fixtureHash: hash(text) };
  } catch (cause) {
    return failure("invalid-discovery-fixture", cause);
  }
}

const modelIdentity = (model: ReturnType<ModelRuntime["getModel"]>) => ({
  provider: model?.provider,
  model: model?.id,
});

type EvalOptions = {
  case?: string;
  provider?: string;
  model?: string;
  condition: string;
  output?: string;
};
function hasSelection(
  options: EvalOptions,
): options is EvalOptions & { provider: string; model: string } {
  return Boolean(
    options.provider?.trim() &&
      options.model?.trim() &&
      ["baseline", "skill", "both"].includes(options.condition),
  );
}

type RunOptions = {
  root: string;
  runtime: ModelRuntime;
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>>;
  fixture: DiscoveryFixture;
  condition: string;
  skill: string | undefined;
  fixtureHash: string;
  scorerHash: string;
  runnerHash: string;
};

async function runCase({
  root,
  runtime,
  model,
  fixture,
  condition,
  skill,
  fixtureHash,
  scorerHash,
  runnerHash,
}: RunOptions) {
  const evaluation = createDiscoveryEval(fixture);
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
    extensionFactories: [evaluation.extension],
    appendSystemPrompt: condition === "skill" && skill !== undefined ? [skill] : [],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd: root,
    agentDir: root,
    model,
    modelRuntime: runtime,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    settingsManager: settings,
    thinkingLevel: "off",
    tools: [
      "inspect_repository",
      "ask_repository_owner",
      "record_workflow_discovery",
      "apply_repository_change",
    ],
  });
  const errors: string[] = extensionsResult.errors.map((error) => error.error);
  let turns = 0;
  let bounded = false;
  const abort = () => {
    bounded = true;
    return session.abort().catch((cause: unknown) => {
      errors.push(redactSecrets(String(cause)));
    });
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "turn_start" && ++turns > 12) abort();
  });
  const timer = setTimeout(abort, 90_000);
  try {
    await session.bindExtensions({ onError: (error) => errors.push(error.error) });
    await session.prompt(evaluation.prompt);
    const assessment = evaluation.assess(session.messages);
    return {
      case: fixture.id,
      condition,
      fixtureHash,
      scorerHash,
      runnerHash,
      skillHash: condition === "skill" && skill !== undefined ? hash(skill) : null,
      ...modelIdentity(session.model),
      thinkingLevel: session.thinkingLevel,
      systemPrompt: session.systemPrompt,
      prompt: evaluation.prompt,
      ...assessment,
      pass: assessment.pass && errors.length === 0 && !bounded,
      errors,
      bounded,
      turns,
      messages: session.messages,
    };
  } catch (cause) {
    return {
      case: fixture.id,
      condition,
      provider: model.provider,
      model: model.id,
      ...failure("eval-run-failed", cause),
      trace: evaluation.assess(session.messages).trace,
      messages: session.messages,
    };
  } finally {
    clearTimeout(timer);
    unsubscribe();
    session.dispose();
  }
}

async function main() {
  let options: EvalOptions;
  try {
    options = parseArgs({
      options: {
        case: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        condition: { type: "string", default: "skill" },
        output: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (cause) {
    console.error(JSON.stringify(failure("invalid-eval-arguments", cause)));
    process.exitCode = 1;
    return;
  }
  const caseFile = cases.get(options.case ?? "");
  if (caseFile === undefined || !hasSelection(options)) {
    console.error(
      JSON.stringify(
        failure(
          "invalid-eval-arguments",
          "Required: --case discovery-conflict|discovery-consistent|discovery-inaccessible --provider PROVIDER --model MODEL [--condition baseline|skill|both] [--output NEW_PATH]",
        ),
      ),
    );
    process.exitCode = 1;
    return;
  }
  const loaded = await loadFixture(caseFile);
  if ("error" in loaded) {
    console.error(JSON.stringify(loaded));
    process.exitCode = 1;
    return;
  }
  const { fixture, fixtureHash } = loaded;
  const scorerHash = hash(
    await readFile(new URL("./lib/guidance-eval.ts", import.meta.url), "utf8"),
  );
  const runnerHash = hash(await readFile(new URL("./eval-guidance.ts", import.meta.url), "utf8"));
  let skill: string | undefined;
  if (options.condition !== "baseline") {
    try {
      skill = await readFile(
        new URL("../skills/project-workflow/SKILL.md", import.meta.url),
        "utf8",
      );
    } catch (cause) {
      console.error(JSON.stringify(failure("guidance-unavailable", cause)));
      process.exitCode = 1;
      return;
    }
  }
  const root = await mkdtemp(join(tmpdir(), "devsys-guidance-eval-"));
  try {
    const runtime = await ModelRuntime.create({
      modelsPath: null,
      modelsStorePath: join(root, "models.json"),
      allowModelNetwork: false,
    });
    const model = runtime.getModel(options.provider, options.model);
    if (
      model === undefined ||
      !runtime
        .getAvailableSnapshot()
        .some((candidate) => candidate.provider === model.provider && candidate.id === model.id)
    ) {
      console.error(
        JSON.stringify(
          failure(
            "eval-model-unavailable",
            "Explicit model or provider credentials unavailable; no fallback was selected.",
          ),
        ),
      );
      process.exitCode = 1;
      return;
    }
    const conditions = options.condition === "both" ? ["baseline", "skill"] : [options.condition];
    const results = [];
    for (const condition of conditions) {
      results.push(
        await runCase({
          root,
          runtime,
          model,
          fixture,
          condition,
          skill,
          fixtureHash,
          scorerHash,
          runnerHash,
        }),
      );
    }
    const report = {
      schema: 1,
      recordedAt: new Date().toISOString(),
      pass: results.every((result) => result.pass),
      results,
    };
    const serialized = `${serializeDiscoveryEvidence(report)}\n`;
    if (options.output === undefined) process.stdout.write(serialized);
    else {
      await writeFile(options.output, serialized, { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ pass: report.pass, output: options.output }));
    }
    if (!report.pass) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (cause) {
  console.error(JSON.stringify(failure("guidance-eval-failed", cause)));
  process.exitCode = 1;
}
