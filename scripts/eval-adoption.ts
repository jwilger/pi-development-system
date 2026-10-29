/** Opt-in finite synthetic effects. Never called by ordinary npm test. */
import { open, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getAgentDir, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import { adoptionHash, runAdoptionCase } from "./lib/adoption-eval.ts";
import { serializeDiscoveryEvidence } from "./lib/guidance-eval.ts";

async function main() {
  const options = parseArgs({
    options: {
      fixture: { type: "string" },
      condition: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      thinking: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  }).values;
  const caseName = options.fixture;
  const condition = options.condition;
  const thinking = options.thinking;
  if (
    (caseName !== "product" && caseName !== "research" && caseName !== "harmless-product") ||
    (condition !== "baseline" && condition !== "guidance") ||
    options.provider !== "openai" ||
    options.model !== "gpt-6.1-sol" ||
    !options.output ||
    (thinking !== undefined &&
      !["off", "minimal", "low", "medium", "high", "xhigh"].includes(thinking))
  )
    throw new Error(
      "invalid-eval-arguments: --fixture product|research|harmless-product --condition baseline|guidance --provider openai --model gpt-6.1-sol [--thinking LEVEL] --output NEW_PATH",
    );
  // Reserve atomically before initialization/model invocation. Failed attempts stay reserved.
  const output = await open(options.output, "wx", 0o600);
  try {
    const configured = SettingsManager.create(process.cwd(), getAgentDir());
    const effectiveThinking =
      thinking ??
      configured.getModelThinkingLevel("openai", "gpt-6.1-sol") ??
      configured.getDefaultThinkingLevel();
    const runtime = await ModelRuntime.create({ allowModelNetwork: false });
    const model = runtime.getModel("openai", "gpt-6.1-sol");
    const available =
      model !== undefined &&
      runtime
        .getAvailableSnapshot()
        .some((entry) => entry.provider === model.provider && entry.id === model.id);
    const result = await runAdoptionCase({
      caseName,
      condition,
      runtime,
      model: available ? model : undefined,
      ...(effectiveThinking === undefined
        ? {}
        : { thinkingLevel: effectiveThinking as ThinkingLevel }),
    });
    const report = {
      schema: 1,
      recordedAt: new Date().toISOString(),
      cliHash: adoptionHash(await readFile(new URL(import.meta.url), "utf8")),
      selection: {
        provider: "openai",
        model: "gpt-6.1-sol",
        thinking: effectiveThinking ?? null,
        explicitModel: true,
      },
      ...result,
    };
    await output.writeFile(`${serializeDiscoveryEvidence(report)}\n`);
    process.stdout.write(`${JSON.stringify({ pass: report.pass, output: options.output })}\n`);
    if (!report.pass) process.exitCode = 1;
  } catch (cause) {
    await output.writeFile(
      `${serializeDiscoveryEvidence({ pass: false, failure: "eval-setup-failed", message: cause instanceof Error ? cause.message : String(cause) })}\n`,
    );
    throw cause;
  } finally {
    await output.close();
  }
}
try {
  await main();
} catch (cause) {
  process.stderr.write(
    `${serializeDiscoveryEvidence({ pass: false, error: "invalid-eval-arguments-or-run", message: cause instanceof Error ? cause.message : String(cause) })}\n`,
  );
  process.exitCode = 1;
}
