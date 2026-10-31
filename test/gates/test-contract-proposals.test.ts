import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { err } from "../../src/core/result.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { createTestContractEvidence } from "../../src/gates/test-contract.ts";
import { registerTestGuard } from "../../src/gates/test-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

for (const proposal of ["deletion", "shell-rewrite", "unmatched-edit"] as const) {
  test(`deletion-bound evidence ${proposal === "deletion" ? "matches deletion" : `does not match ${proposal}`}`, async (t) => {
    const cwd = mkdtempSync(join(tmpdir(), "contract-proposal-"));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    mkdirSync(join(cwd, "test"));
    const path = "test/a.test.ts";
    const before = "assert.equal(actual, 1);\n";
    writeFileSync(join(cwd, path), before);
    const fake = createFakePi({ cwd });
    const state = createSessionState(fake.api);
    const evidence = createTestContractEvidence();
    evidence.supply(
      { cwd, slice: state.get().activeSlice, path, before, after: undefined },
      "Deletion contract only",
    );
    let received: unknown;
    const jev: Jev = {
      ask: async (input) => {
        // The classifier boundary serializes absent optional evidence as an empty string.
        received = input.contractEvidence === "" ? undefined : input.contractEvidence;
        return err({
          kind: "assessment-unresolved",
          category: "insufficient-evidence",
          message: "Fixture unresolved",
        });
      },
      availability: () => "online",
      model: () => "fixture",
    };
    registerTestGuard({
      pi: fake.api,
      state,
      approvals: createApprovalStore(fake.api),
      jev: () => jev,
      contractEvidence: evidence,
    });
    if (proposal === "unmatched-edit") {
      await fake.emit({
        type: "tool_call",
        toolName: "edit",
        toolCallId: "proposal",
        input: { path, edits: [{ oldText: "absent", newText: "replacement" }] },
      } as never);
    } else {
      await fake.emit({
        type: "tool_call",
        toolName: "bash",
        toolCallId: "proposal",
        input: { command: proposal === "deletion" ? `rm ${path}` : `sed -i 's/1/2/' ${path}` },
      } as never);
    }
    assert.equal(received, proposal === "deletion" ? "Deletion contract only" : undefined);
  });
}
