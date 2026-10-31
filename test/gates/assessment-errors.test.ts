import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { err } from "../../src/core/result.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { registerTestGuard } from "../../src/gates/test-guard.ts";
import type { Jev, JevError } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

for (const cause of [
  { kind: "provider", message: "Provider unavailable" },
  { kind: "timeout" },
  { kind: "usage-recording", message: "Accounting unavailable" },
  { kind: "aborted" },
] satisfies JevError[]) {
  test(`assessment ${cause.kind} remains a typed failure at the edit boundary`, async (t) => {
    const cwd = mkdtempSync(join(tmpdir(), "assessment-error-"));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    mkdirSync(join(cwd, "test"));
    writeFileSync(join(cwd, "test/a.test.ts"), "assert.equal(actual, 1);\n");
    const fake = createFakePi({ cwd });
    const jev: Jev = {
      ask: async () => err(cause),
      availability: () => "online",
      model: () => "fixture",
    };
    registerTestGuard({
      pi: fake.api,
      state: createSessionState(fake.api),
      approvals: createApprovalStore(fake.api),
      jev: () => jev,
      now: () => new Date(),
    });
    const result = await fake.emit({
      type: "tool_call",
      toolName: "edit",
      toolCallId: "edit",
      input: { path: "test/a.test.ts", edits: [{ oldText: "1", newText: "2" }] },
    } as never);
    assert.ok(result && typeof result === "object" && "block" in result && result.block);
    assert.ok("reason" in result && typeof result.reason === "string");
    const envelope = JSON.parse(result.reason.split("\n").at(-1) ?? "");
    assert.equal(envelope.category, "infrastructure");
    assert.equal(envelope.cause.kind, cause.kind);
    assert.match(envelope.goal, /bounded investigation/);
    assert.equal(fake.ui.calls.filter((c) => c.kind === "confirm").length, 0);
  });
}
