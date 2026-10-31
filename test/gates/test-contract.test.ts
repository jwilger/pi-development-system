import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSupplyTestContractTool,
  createTestContractEvidence,
} from "../../src/gates/test-contract.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("contract evidence cannot be supplied through a workspace symlink to an external test", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "test-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "workspace");
  mkdirSync(join(cwd, "test"), { recursive: true });
  const external = join(root, "external.test.ts");
  writeFileSync(external, "assert.equal(actual, 1);\n");
  symlinkSync(external, join(cwd, "test/a.test.ts"));
  const fake = createFakePi({ cwd });
  const tool = createSupplyTestContractTool({
    evidence: createTestContractEvidence(),
    state: createSessionState(fake.api),
  });
  const result = await tool.execute(
    "evidence",
    {
      path: "test/a.test.ts",
      after: "assert.equal(actual, 2);\n",
      contractEvidence: "Existing requirement",
    },
    undefined,
    undefined,
    {
      ...fake.ctx,
      tools: [],
      executeTool: async () => {
        throw new Error("Unexpected nested tool call");
      },
    },
  );
  assert.equal(result.isError, true);
  assert.equal(result.details.kind, "invalid-path");
});

test("evidence is bound to workspace, slice, path, current content and exact proposal", () => {
  const store = createTestContractEvidence();
  const binding = {
    cwd: "/workspace",
    slice: "shell",
    path: "test/a.test.ts",
    before: "original",
    after: "proposed",
  };
  store.supply(binding, "Existing D40 requirement; all old assertions retained");
  assert.equal(store.read(binding), "Existing D40 requirement; all old assertions retained");
  for (const different of [
    { cwd: "/elsewhere" },
    { slice: "other" },
    { path: "test/b.test.ts" },
    { before: "edited" },
    { after: "different" },
    { after: undefined },
  ]) {
    assert.equal(store.read({ ...binding, ...different }), undefined);
  }
});
