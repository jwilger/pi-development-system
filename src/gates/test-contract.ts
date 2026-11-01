import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { redactSecrets } from "../core/redact.ts";
import { isTestPath, normalizeRepoPath } from "../core/test-paths.ts";
import { normalizeText } from "../core/test-weakening.ts";
import type { SessionState } from "../state/session-state.ts";

type Binding = {
  cwd: string;
  slice: string | undefined;
  path: string;
  before: string;
  after: string | undefined;
};
const key = (binding: Binding): string =>
  createHash("sha256").update(JSON.stringify(binding)).digest("hex");

/** Ephemeral evidence only: neither authorization nor a cached gate verdict. */
export function createTestContractEvidence() {
  const entries = new Map<string, string>();
  return {
    supply(binding: Binding, contract: string) {
      // Bound session memory; eviction loses evidence, never grants permission.
      if (entries.size >= 32) entries.clear();
      entries.set(key(binding), redactSecrets(contract).slice(0, 12000));
    },
    read(binding: Binding): string | undefined {
      return entries.get(key(binding));
    },
  };
}
export type TestContractEvidence = ReturnType<typeof createTestContractEvidence>;

export function createSupplyTestContractTool(deps: {
  evidence: TestContractEvidence;
  state: SessionState;
}) {
  const parameters = Type.Object({
    path: Type.String({ minLength: 1 }),
    after: Type.Optional(Type.String()),
    contractEvidence: Type.String({ minLength: 1, maxLength: 12000 }),
  });
  return {
    name: "devsys_supply_test_contract",
    label: "Supply test contract evidence",
    description:
      "Supply existing contract evidence for an exact proposed test edit, then retry the normal edit/write gate. This does not approve a change or record a departure. Give the full proposed file as after; omit after only for deletion. Cite existing requirements and explain retained coverage; do not invent approval.",
    parameters,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const slice = deps.state.get().activeSlice;
      const path = normalizeRepoPath(ctx.cwd, params.path, homedir());
      if (!isTestPath(path) || path.startsWith("../") || path.startsWith("/")) {
        return {
          content: [{ type: "text", text: "Evidence requires a test path inside this workspace." }],
          details: { kind: "invalid-path" },
          isError: true,
        };
      }
      let before: string;
      try {
        const root = await realpath(ctx.cwd);
        const target = await realpath(join(root, path));
        const local = relative(root, target);
        if (local === ".." || local.startsWith("../") || isAbsolute(local)) {
          return {
            content: [
              {
                type: "text",
                text: "Evidence requires a test file inside this workspace, including symlink targets.",
              },
            ],
            details: { kind: "invalid-path" },
            isError: true,
          };
        }
        before = normalizeText(await readFile(target, "utf8"));
      } catch {
        return {
          content: [
            { type: "text", text: "Cannot read current test file; inspect the path and retry." },
          ],
          details: { kind: "evidence-unavailable" },
          isError: true,
        };
      }
      if (params.contractEvidence.trim() === "") {
        return {
          content: [
            { type: "text", text: "Supply a specific existing contract and retained coverage." },
          ],
          details: { kind: "missing-evidence" },
          isError: true,
        };
      }
      if (deps.state.get().activeSlice !== slice) {
        return {
          content: [
            {
              type: "text",
              text: "The active slice changed while reading evidence. Inspect the current slice and resubmit; no evidence was retained.",
            },
          ],
          details: { kind: "stale-slice" },
          isError: true,
        };
      }
      deps.evidence.supply(
        {
          cwd: ctx.cwd,
          slice,
          path,
          before,
          after: params.after === undefined ? undefined : normalizeText(params.after),
        },
        params.contractEvidence,
      );
      return {
        content: [
          {
            type: "text",
            text: "Evidence retained for this exact edit in this workspace and slice. Retry the normal gate; no permission or assessment result has been granted. Resubmit if the file, proposal, slice or session changes.",
          },
        ],
        details: { kind: "evidence-supplied" },
      };
    },
  } satisfies ToolDefinition<typeof parameters>;
}
