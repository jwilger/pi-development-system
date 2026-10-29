/** Explicit offline-only reassessment of six immutable transcripts; never a live runner. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { serializeDiscoveryEvidence } from "../../scripts/lib/guidance-eval.ts";
import { createReviewEval } from "../../scripts/lib/review-eval.ts";
import { offlineSession } from "../../test/harness/offline-session.ts";

const label = process.env.REVIEW_REASSESSMENT_LABEL;
if (label !== undefined && !/^[a-z][a-z0-9-]{0,40}$/.test(label)) {
  console.error("invalid-reassessment-label");
  process.exit(2);
}
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
type Original = {
  prompt: string;
  fixture: unknown;
  guidance: unknown;
  input: unknown;
  messages: AgentMessage[];
  pass: boolean;
  checks: unknown;
};

for (const caseName of ["concern", "harmless", "conflict"] as const) {
  for (const condition of ["baseline", "guidance"] as const) {
    test(`offline reassessment: ${caseName}/${condition}`, async (t) => {
      const originalPath = `evals/review/initialized-${caseName}-${condition}.json`;
      const output = `evals/review/reassessed-${label === undefined ? "" : `${label}-`}initialized-${caseName}-${condition}.json`;
      // Reserve once before replay; never overwrite either original or derived evidence.
      const file = await open(new URL(`../../${output}`, import.meta.url), "wx", 0o600);
      const report: Record<string, unknown> = {
        schema: 1,
        kind: "offline-transcript-reassessment",
        correction: label ?? "canonical-question-citations",
        recordedAt: new Date().toISOString(),
        case: caseName,
        condition,
        pass: false,
        noInference: {
          modelCalls: 0,
          liveProviderCalls: 0,
          scriptedProvider: "offline-devsys/scripted",
          network: "denied by fetch guard",
          assessmentMessages: "unchanged original transcript",
          state: "original tool calls replayed through actual SDK and typed submit tool",
        },
      };
      try {
        const originalBytes = await readFile(
          new URL(`../../${originalPath}`, import.meta.url),
          "utf8",
        );
        const original: Original = JSON.parse(originalBytes);
        report.original = { path: originalPath, sha256: hash(originalBytes) };
        report.originalResult = { pass: original.pass, checks: original.checks };
        report.hashes = Object.fromEntries(
          await Promise.all(
            [
              "scripts/lib/review-eval.ts",
              "evals/review/reassess.ts",
              "scripts/lib/guidance-eval.ts",
              "test/harness/offline-session.ts",
              "src/review/submit-tool.ts",
              "src/review/submissions.ts",
            ].map(async (path) => [
              path,
              hash(await readFile(new URL(`../../${path}`, import.meta.url), "utf8")),
            ]),
          ),
        );
        const evaluation = createReviewEval(caseName, condition);
        for (const field of ["prompt", "fixture", "guidance", "input"] as const)
          assert.deepEqual(evaluation[field], original[field], `unchanged ${field}`);
        const batches = original.messages.flatMap((message) => {
          if (message.role !== "assistant") return [];
          const calls = message.content.filter((part) => part.type === "toolCall");
          return calls.length > 0 ? [calls] : [];
        });
        const fetch = t.mock.method(globalThis, "fetch", () => {
          throw new Error("offline-reassessment-must-not-use-network");
        });
        const host = await offlineSession(
          t,
          evaluation.extension,
          (_context, request) => batches[request] ?? [],
        );
        await host.session.prompt(original.prompt);
        assert.deepEqual(host.errors, []);
        assert.equal(fetch.mock.callCount(), 0);
        const result = evaluation.assess(original.messages);
        Object.assign(report, result, {
          replayErrors: host.errors,
          fetchCalls: fetch.mock.callCount(),
          toolCallBatches: batches.length,
        });
      } catch (cause) {
        report.pass = false;
        report.error = cause instanceof Error ? cause.message : String(cause);
        throw cause;
      } finally {
        await file.writeFile(`${serializeDiscoveryEvidence(report)}\n`);
        await file.close();
      }
      assert.equal(report.pass, true, JSON.stringify(report));
    });
  }
}
