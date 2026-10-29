/** Opt-in bounded synthetic effect evaluation. Never run by npm test. */
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
import { phaseGuide } from "../src/context/phase-guide.ts";
import { redactSecrets } from "../src/core/redact.ts";
import { createFlowEval, FLOW_CASES } from "./lib/bounded-flow-eval.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string" },
      model: { type: "string" },
      output: { type: "string" },
      baseline: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!(values.provider && values.model && values.output))
    throw new Error("Required: --provider PROVIDER --model MODEL --output NEW_PATH [--baseline]");
  const paths = [
    "skills/work-intake-and-slicing/SKILL.md",
    "skills/delegation/SKILL.md",
    "skills/code-review/SKILL.md",
    "prompts/devsys-plan.md",
  ];
  const sources = await Promise.all(
    paths.map(async (path) => ({
      path,
      content: await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
    })),
  );
  const guidance = values.baseline
    ? ""
    : [...sources.map((source) => source.content), phaseGuide("implementing")].join("\n\n");
  const identity = {
    runnerHash: hash(await readFile(new URL(import.meta.url), "utf8")),
    scorerHash: hash(
      await readFile(new URL("./lib/bounded-flow-eval.ts", import.meta.url), "utf8"),
    ),
    guidanceHash: hash(guidance),
    sources: sources.map(({ path, content }) => ({ path, hash: hash(content) })),
  };
  const root = await mkdtemp(join(tmpdir(), "bounded-flow-eval-"));
  try {
    const runtime = await ModelRuntime.create({
      modelsPath: null,
      modelsStorePath: join(root, "models.json"),
      allowModelNetwork: false,
    });
    const model = runtime.getModel(values.provider, values.model);
    if (
      !(
        model &&
        runtime
          .getAvailableSnapshot()
          .some((candidate) => candidate.provider === model.provider && candidate.id === model.id)
      )
    )
      throw new Error("Explicit model/credentials unavailable; no fallback");
    const results = [];
    for (const kind of FLOW_CASES) {
      const evaluation = createFlowEval(kind);
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
        appendSystemPrompt: guidance ? [guidance] : [],
      });
      await loader.reload();
      const { session } = await createAgentSession({
        cwd: root,
        agentDir: root,
        model,
        modelRuntime: runtime,
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(),
        settingsManager: settings,
        tools: ["workflow_action"],
        customTools: [evaluation.tool],
        thinkingLevel: "low",
      });
      let turns = 0;
      let bounded = false;
      const abort = () => {
        bounded = true;
        session.abort().catch((cause: unknown) => {
          console.error(redactSecrets(String(cause)));
        });
      };
      const unsubscribe = session.subscribe((event) => {
        if (event.type === "turn_start" && ++turns > 12) abort();
      });
      const timer = setTimeout(abort, 90_000);
      let error: string | undefined;
      try {
        await session.prompt(evaluation.prompt);
      } catch (cause) {
        error = String(cause);
      } finally {
        clearTimeout(timer);
        unsubscribe();
      }
      const assessment = evaluation.assess();
      const providerFailed = session.messages.some(
        (message) => message.role === "assistant" && message.stopReason === "error",
      );
      results.push({
        kind,
        ...assessment,
        pass: assessment.pass && !bounded && !error && !providerFailed,
        promptHash: hash(evaluation.prompt),
        bounded,
        turns,
        error,
        providerFailed,
        provider: session.model?.provider,
        model: session.model?.id,
        thinkingLevel: session.thinkingLevel,
        finalText: session.getLastAssistantText(),
      });
      session.dispose();
    }
    const report = {
      schema: 1,
      recordedAt: new Date().toISOString(),
      condition: values.baseline ? "no-guidance" : "guidance",
      ...identity,
      pass: results.every((result) => result.pass),
      results,
    };
    await writeFile(
      values.output,
      `${JSON.stringify(
        report,
        (_key, value: unknown) => (typeof value === "string" ? redactSecrets(value) : value),
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    console.log(JSON.stringify({ pass: report.pass, output: values.output }));
    if (!report.pass) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((cause: unknown) => {
  console.error(redactSecrets(String(cause)));
  process.exitCode = 1;
});
