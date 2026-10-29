/** Opt-in, one explicit live cell. Ordinary tests use only the offline public SDK. */
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { serializeDiscoveryEvidence } from "./lib/guidance-eval.ts";
import { createReviewEval, createReviewRuntime } from "./lib/review-eval.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const provenancePaths = [
  "scripts/eval-review.ts",
  "scripts/lib/review-eval.ts",
  "scripts/lib/guidance-eval.ts",
  "src/core/review-flow.ts",
  "src/core/review.ts",
  "src/core/review-submission.ts",
  "src/review/digest.ts",
  "src/review/submissions.ts",
  "src/review/submit-tool.ts",
  "src/state/local-guidance.ts",
  "src/state/session-state.ts",
];

async function runCell(
  evaluation: ReturnType<typeof createReviewEval>,
  root: string,
  provider: string,
  modelId: string,
) {
  const errors: string[] = [];
  const runtime = await createReviewRuntime({ modelsStorePath: join(root, "models.json") });
  const model = runtime.getModel(provider, modelId);
  if (
    model === undefined ||
    !runtime
      .getAvailableSnapshot()
      .some((candidate) => candidate.provider === provider && candidate.id === modelId)
  )
    throw new Error(
      "eval-model-unavailable: explicit model or credentials unavailable; no fallback selected",
    );
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
    noTools: "builtin",
    tools: evaluation.tools,
  });
  errors.push(...extensionsResult.errors.map((error) => error.error));
  let turns = 0;
  let bounded = false;
  const abort = () => {
    bounded = true;
    return session.abort().catch((cause: unknown) => {
      errors.push(messageOf(cause));
    });
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "turn_start" && ++turns >= 12) abort();
  });
  const timer = setTimeout(abort, 90_000);
  try {
    await session.bindExtensions({ onError: (error) => errors.push(error.error) });
    try {
      await session.prompt(evaluation.prompt);
    } catch (cause) {
      errors.push(messageOf(cause));
    }
    const assessment = evaluation.assess(session.messages);
    return {
      ...assessment,
      pass: assessment.pass && errors.length === 0 && !bounded,
      effective: {
        provider: session.model?.provider,
        model: session.model?.id,
        thinkingLevel: session.thinkingLevel,
      },
      systemPrompt: session.systemPrompt,
      errors,
      bounded,
      turns,
      messages: session.messages,
    };
  } finally {
    clearTimeout(timer);
    unsubscribe();
    session.dispose();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      case: { type: "string" },
      condition: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const { case: caseName, condition, provider, model, output } = values;
  if (
    (caseName !== "concern" && caseName !== "harmless" && caseName !== "conflict") ||
    (condition !== "baseline" && condition !== "guidance") ||
    !provider?.trim() ||
    !model?.trim() ||
    !output?.trim()
  )
    throw new Error(
      "invalid-eval-arguments: required --case concern|harmless|conflict --condition baseline|guidance --provider PROVIDER --model MODEL --output NEW_PATH",
    );
  // Reserve exclusively before any provider access: an existing evidence path never reruns a cell.
  const evidence = await open(output, "wx", 0o600);
  const evaluation = createReviewEval(caseName, condition);
  let root: string | undefined;
  const report: Record<string, unknown> = {
    schema: 1,
    recordedAt: new Date().toISOString(),
    case: caseName,
    condition,
    requested: { provider, model, thinkingLevel: "off" },
    effective: null,
    limits: { turns: 12, milliseconds: 90_000, retry: false },
    prompt: evaluation.prompt,
    fixture: evaluation.fixture,
    guidance: evaluation.guidance,
    input: evaluation.input,
    fixtureHash: hash(JSON.stringify(evaluation.fixture)),
    guidanceHash: hash(JSON.stringify(evaluation.guidance)),
    pass: false,
  };
  try {
    report.hashes = Object.fromEntries(
      await Promise.all(
        provenancePaths.map(async (path) => [
          path,
          hash(await readFile(new URL(`../${path}`, import.meta.url), "utf8")),
        ]),
      ),
    );
    root = await mkdtemp(join(tmpdir(), "devsys-review-eval-"));
    Object.assign(report, await runCell(evaluation, root, provider, model));
  } catch (cause) {
    Object.assign(report, {
      error: "review-eval-failed",
      errors: [messageOf(cause)],
      ...evaluation.assess(),
    });
    report.pass = false;
  } finally {
    await evidence.writeFile(`${serializeDiscoveryEvidence(report)}\n`);
    await evidence.close();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ pass: report.pass, output }));
  if (report.pass !== true) process.exitCode = 1;
}

try {
  await main();
} catch (cause) {
  console.error(
    serializeDiscoveryEvidence({
      pass: false,
      error: "review-eval-cli-failed",
      message: messageOf(cause),
    }),
  );
  process.exitCode = 1;
}
