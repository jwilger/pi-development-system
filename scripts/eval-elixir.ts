/** Opt-in finite live effects; never invoked by ordinary npm test. */
import { access, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { getAgentDir, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import { elixirHash, parseElixirFixture, runElixirCase } from "./lib/elixir-eval.ts";
import { serializeDiscoveryEvidence } from "./lib/guidance-eval.ts";

const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
function isThinking(value: string): value is (typeof thinkingLevels)[number] {
  return thinkingLevels.some((level) => level === value);
}

function readOptions() {
  const options = parseArgs({
    options: {
      fixture: { type: "string" },
      condition: { type: "string", default: "skill" },
      provider: { type: "string" },
      model: { type: "string" },
      thinking: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  }).values;
  if (
    !["mix", "phoenix", "control"].includes(options.fixture ?? "") ||
    (options.condition !== "baseline" && options.condition !== "skill") ||
    Boolean(options.provider?.trim()) !== Boolean(options.model?.trim()) ||
    (options.thinking !== undefined && !isThinking(options.thinking))
  )
    throw new Error(
      "invalid-eval-arguments: --fixture mix|phoenix|control --condition baseline|skill [--provider PROVIDER --model MODEL] [--thinking LEVEL] [--output NEW_PATH]",
    );
  const condition: "baseline" | "skill" = options.condition;
  return { ...options, condition };
}

async function main() {
  const options = readOptions();
  if (options.output !== undefined) {
    const exists = await access(options.output).then(
      () => true,
      () => false,
    );
    if (exists) throw new Error("evidence-output-exists: refusing another model call or overwrite");
  }
  const fixtureText = await readFile(
    new URL(`../evals/elixir/${options.fixture}.json`, import.meta.url),
    "utf8",
  );
  const fixture = parseElixirFixture(JSON.parse(fixtureText));
  if ("error" in fixture) throw new Error(fixture.error);
  // Read selection preferences only; do not load user/project resources into the sandbox.
  const configured = SettingsManager.create(process.cwd(), getAgentDir());
  const provider = options.provider ?? configured.getDefaultProvider();
  const modelId = options.model ?? configured.getDefaultModel();
  const configuredThinking =
    provider !== undefined && modelId !== undefined
      ? configured.getModelThinkingLevel(provider, modelId)
      : undefined;
  const thinking = options.thinking ?? configuredThinking ?? configured.getDefaultThinkingLevel();
  const runtime = await ModelRuntime.create({ allowModelNetwork: false });
  const selected =
    provider !== undefined && modelId !== undefined
      ? runtime.getModel(provider, modelId)
      : undefined;
  const available =
    selected !== undefined &&
    runtime
      .getAvailableSnapshot()
      .some(
        (candidate) => candidate.provider === selected.provider && candidate.id === selected.id,
      );
  const skill =
    options.condition === "skill"
      ? await readFile(new URL("../skills/profile-elixir/SKILL.md", import.meta.url), "utf8")
      : undefined;
  const result = await runElixirCase({
    fixture,
    condition: options.condition,
    runtime,
    model: available ? selected : undefined,
    ...(skill === undefined ? {} : { skill }),
    ...(thinking !== undefined && isThinking(thinking) ? { thinkingLevel: thinking } : {}),
  });
  const report = {
    schema: 1,
    recordedAt: new Date().toISOString(),
    cliHash: elixirHash(await readFile(new URL(import.meta.url), "utf8")),
    fixtureFileHash: elixirHash(fixtureText),
    selection: {
      provider: provider ?? null,
      model: modelId ?? null,
      thinking: thinking ?? null,
      explicitModel: options.model !== undefined,
    },
    ...result,
  };
  const serialized = `${serializeDiscoveryEvidence(report)}\n`;
  if (options.output === undefined) process.stdout.write(serialized);
  else {
    await writeFile(options.output, serialized, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ pass: report.pass, output: options.output })}\n`);
  }
  if (!report.pass) process.exitCode = 1;
}

try {
  await main();
} catch (cause) {
  process.stderr.write(
    `${serializeDiscoveryEvidence({ pass: false, error: "invalid-eval-arguments-or-run", message: cause instanceof Error ? cause.message : String(cause) })}\n`,
  );
  process.exitCode = 1;
}
