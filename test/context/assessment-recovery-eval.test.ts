import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../../scripts/eval-assessment-recovery.ts";
import { createFakePi } from "../harness/fake-pi.ts";

for (const scenario of ["owner-decision", "provider-outage"] as const) {
  for (const wrong of ["question", "reason", "neither"] as const) {
    test(`${scenario} validates escalation content (${wrong}) after inspection`, async () => {
      const evaluation = fixture(scenario);
      const fake = createFakePi();
      evaluation.extension(fake.api);
      const call = async (name: string, params: Record<string, string>) => {
        const tool = fake.tools.get(name);
        assert.ok(tool);
        return tool.execute("trace", params, undefined, undefined, {
          ...fake.ctx,
          tools: [],
          executeTool: async () => {
            throw new Error("Unexpected nested tool");
          },
        });
      };
      const specific =
        scenario === "owner-decision"
          ? "Should Quit discard unsaved work? This product decision is unresolved."
          : "Provider credentials are revoked; renew credentials to restore access. No authorized local repair exists.";
      await call("inspect_repository", {});
      await call("ask_repository_owner", {
        question:
          wrong === "question"
            ? "Please reapprove the approved scope because the assessment is unresolved."
            : specific,
      });
      await call("update_goal", {
        status: "blocked",
        reason:
          wrong === "reason" ? "Assessment unresolved; waiting for scope reapproval." : specific,
      });
      assert.equal(evaluation.assess().pass, wrong === "neither");
      assert.ok(
        evaluation
          .assess()
          .trace.some((entry) => entry.tool === "ask_repository_owner" && entry.input),
      );
      assert.ok(
        evaluation.assess().trace.some((entry) => entry.tool === "update_goal" && entry.input),
      );
    });
  }
}
