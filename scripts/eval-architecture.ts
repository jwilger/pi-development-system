#!/usr/bin/env -S node --experimental-transform-types --no-warnings
/** Opt-in, one explicit live cell; ordinary regression tests are offline. */
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ARCHITECTURE_POLICY } from "../src/core/architecture-policy.ts";
import { createArchitectureEval, runArchitectureCell } from "./lib/architecture-eval.ts";
import { serializeDiscoveryEvidence } from "./lib/guidance-eval.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const sources = [
  "scripts/eval-architecture.ts",
  "scripts/lib/architecture-eval.ts",
  "scripts/lib/guidance-eval.ts",
  "src/core/architecture-policy.ts",
  "src/core/redact.ts",
  "src/context/system-prompt.ts",
];

export async function runArchitectureCli(args: string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      args,
      options: {
        provider: { type: "string" },
        model: { type: "string" },
        output: { type: "string" },
        case: { type: "string" },
        condition: { type: "string" },
        "workflow-prompt": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
    const {
      provider,
      model,
      output,
      case: caseName,
      condition,
      "workflow-prompt": workflowName,
    } = values;
    if (
      !(provider?.trim() && model?.trim() && output?.trim() && caseName) ||
      (condition !== "baseline" && condition !== "guidance") ||
      (workflowName !== undefined && workflowName !== "devsys-start")
    ) {
      throw new Error(
        "architecture-eval-arguments: require explicit --provider --model --output --case --condition baseline|guidance",
      );
    }
    const evaluation = createArchitectureEval(caseName, condition);
    // Exclusive reservation precedes runtime/credential/provider access. Never overwrite evidence.
    const evidence = await open(output, "wx", 0o600);
    let root: string | undefined;
    const started = Date.now();
    const report: Record<string, unknown> = {
      schema: 1,
      recordedAt: new Date(started).toISOString(),
      requested: { provider, model, thinkingLevel: "off" },
      condition,
      fixture: evaluation.fixture,
      fixtureHash: hash(JSON.stringify(evaluation.fixture)),
      prompt: evaluation.prompt,
      promptHash: hash(evaluation.prompt),
      policy: {
        source: "src/core/architecture-policy.ts",
        sourceHash: hash(ARCHITECTURE_POLICY),
        injectedHash: condition === "guidance" ? hash(ARCHITECTURE_POLICY.trim()) : null,
      },
      limits: { turns: 12, milliseconds: 90_000, retry: false, compaction: false },
      tools: evaluation.tools,
      pass: false,
      result: null,
      error: null,
      scope:
        "Observable synthetic decisions; not semantic truth, independent review, or universal enforcement.",
    };
    try {
      report.sources = Object.fromEntries(
        await Promise.all(
          sources.map(async (path) => [
            path,
            hash(await readFile(new URL(`../${path}`, import.meta.url), "utf8")),
          ]),
        ),
      );
      const workflowPrompt =
        workflowName === undefined
          ? undefined
          : fileURLToPath(new URL("../prompts/devsys-start.md", import.meta.url));
      if (workflowPrompt !== undefined) {
        const content = await readFile(workflowPrompt, "utf8");
        report.workflow = {
          source: "prompts/devsys-start.md",
          sourceHash: hash(content),
          content,
          invocation: "/devsys-start",
        };
      }
      report.sdk = JSON.parse(
        await readFile(
          new URL("../node_modules/@earendil-works/pi-coding-agent/package.json", import.meta.url),
          "utf8",
        ),
      ).version;
      root = await mkdtemp(join(tmpdir(), "architecture-policy-eval-"));
      const result = await runArchitectureCell({
        evaluation,
        root,
        provider,
        modelId: model,
        ...(workflowPrompt === undefined ? {} : { workflowPrompt }),
      });
      Object.assign(report, { result, pass: result.pass });
    } catch (cause) {
      report.error = messageOf(cause);
    } finally {
      report.elapsedMilliseconds = Date.now() - started;
      report.requestPolicyHashes = evaluation.requestPolicies.map((policy) =>
        policy === null ? null : hash(policy),
      );
      try {
        await evidence.writeFile(`${serializeDiscoveryEvidence(report)}\n`);
        await evidence.chmod(0o400);
      } finally {
        await evidence.close();
        if (root !== undefined) await rm(root, { recursive: true, force: true });
      }
    }
    console.log(JSON.stringify({ pass: report.pass, output }));
    return report.pass === true ? 0 : 1;
  } catch (cause) {
    console.error(serializeDiscoveryEvidence({ pass: false, error: messageOf(cause) }));
    return 1;
  }
}
if (import.meta.main) process.exitCode = await runArchitectureCli(process.argv.slice(2));
