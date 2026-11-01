import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { err } from "../../src/core/result.ts";
import type { SliceRef } from "../../src/core/types.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import {
  createSupplyTestContractTool,
  createTestContractEvidence,
} from "../../src/gates/test-contract.ts";
import { registerTestGuard } from "../../src/gates/test-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

function workspace(t: test.TestContext, before: string) {
  const cwd = mkdtempSync(join(tmpdir(), "contract-recovery-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "test"));
  const path = "test/a.test.ts";
  writeFileSync(join(cwd, path), before);
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  state.update((s) => ({ ...s, activeSlice: "original" as SliceRef }));
  const evidence = createTestContractEvidence();
  const tool = createSupplyTestContractTool({ evidence, state });
  const ctx = {
    ...fake.ctx,
    tools: [],
    executeTool: async () => {
      throw new Error("Unexpected nested tool");
    },
  };
  return { cwd, path, fake, state, evidence, tool, ctx };
}

test("an in-flight evidence submission cannot move into a newly selected slice", async (t) => {
  const before = "assert.equal(actual, 1);\n";
  const w = workspace(t, before);
  const pending = w.tool.execute(
    "evidence",
    { path: w.path, contractEvidence: "Original slice contract" },
    undefined,
    undefined,
    w.ctx,
  );
  // execute has entered its first filesystem await; switch before that I/O completes.
  w.state.update((s) => ({ ...s, activeSlice: "replacement" as SliceRef }));
  const result = await pending;
  assert.equal(result.isError, true);
  assert.equal(result.details.kind, "stale-slice");
  for (const slice of ["original", "replacement"]) {
    assert.equal(
      w.evidence.read({ cwd: w.cwd, path: w.path, before, after: undefined, slice }),
      undefined,
    );
  }
});

test("supplied deletion evidence reaches the normal shell gate for CRLF and trailing spaces", async (t) => {
  const w = workspace(t, "assert.equal(actual, 1);  \r\n");
  const supplied = await w.tool.execute(
    "evidence",
    { path: w.path, contractEvidence: "Approved retirement of the obsolete requirement" },
    undefined,
    undefined,
    w.ctx,
  );
  assert.equal(supplied.isError, undefined);
  let received: unknown;
  const jev: Jev = {
    ask: async (input) => {
      received = input.contractEvidence;
      return err({
        kind: "assessment-unresolved",
        category: "insufficient-evidence",
        message: "Fixture refusal",
      });
    },
    availability: () => "online",
    model: () => "fixture",
  };
  registerTestGuard({
    pi: w.fake.api,
    state: w.state,
    approvals: createApprovalStore(w.fake.api),
    jev: () => jev,
    contractEvidence: w.evidence,
  });
  const result = await w.fake.emit({
    type: "tool_call",
    toolName: "bash",
    toolCallId: "deletion",
    input: { command: `rm ${w.path}` },
  } as never);
  assert.equal(received, "Approved retirement of the obsolete requirement");
  assert.deepEqual(
    typeof result === "object" && result !== null && "block" in result ? result.block : undefined,
    true,
  );
});
