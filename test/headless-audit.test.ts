import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDevelopmentSystem } from "../extensions/development-system.ts";
import { createFakePi, type NestedRunner } from "./harness/fake-pi.ts";

// Non-negotiable 5: a gate that cannot ask must refuse, never wave the call through. With no UI
// (print mode, a subagent, CI) every guard that would have asked the user blocks, and does so the
// same way when the call is made from inside a codemode script (I8b.1 nested calls).

type Call = {
  label: string;
  tool: "bash" | "edit" | "write";
  input: Record<string, unknown>;
  gate: RegExp;
};

const TEST_FILE = "test/a.test.ts";
const ORIGINAL = "test('adds', () => {\n  assert.equal(add(1, 2), 3);\n});\n";

const CALLS: Call[] = [
  {
    label: "force push",
    tool: "bash",
    input: { command: "git push --force origin main" },
    gate: /git\.force-push/,
  },
  {
    label: "force push with lease",
    tool: "bash",
    input: { command: "git push --force-with-lease" },
    gate: /git\.force-push/,
  },
  {
    label: "hard reset",
    tool: "bash",
    input: { command: "git reset --hard HEAD~3" },
    gate: /git\.destructive-reset/,
  },
  {
    label: "remote branch delete",
    tool: "bash",
    input: { command: "git push origin --delete feature" },
    gate: /git\.branch-delete-remote/,
  },
  {
    label: "push with no-verify",
    tool: "bash",
    input: { command: "git push --no-verify origin feature" },
    gate: /git\.no-verify/,
  },
  {
    label: "rebase",
    tool: "bash",
    input: { command: "git rebase -i HEAD~3" },
    gate: /git\.history-rewrite/,
  },
  {
    label: "delete a test file",
    tool: "bash",
    input: { command: `rm ${TEST_FILE}` },
    gate: /tests\.weaken/,
  },
  {
    label: "skip a test",
    tool: "edit",
    input: { path: TEST_FILE, edits: [{ oldText: "test('adds'", newText: "test.skip('adds'" }] },
    gate: /tests\.weaken/,
  },
  {
    label: "a bare lint suppression",
    tool: "write",
    input: {
      path: "src/a.ts",
      content: "// biome-ignore lint/suspicious/noExplicitAny\nexport const a: any = 1;\n",
    },
    gate: /lints\.suppression/,
  },
];

const succeed: NestedRunner = () => ({ text: "ran", isError: false });

const setup = (mode = "trunk") => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-headless-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version = 1\n\n[delivery]\nmode = "${mode}"\n`,
  );
  mkdirSync(join(cwd, "test"));
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, TEST_FILE), ORIGINAL);
  const fake = createFakePi({ hasUI: false, cwd });
  // A guard that wrongly prompts would get "yes" and let the call through, failing the test.
  fake.ui.confirmResponses.push(...Array.from({ length: 20 }, () => true));
  createDevelopmentSystem(fake.api);
  return fake;
};

for (const call of CALLS) {
  test(`headless: ${call.label} is blocked, directly and from a script`, async () => {
    const fake = setup();
    const direct = (await fake.emit({
      type: "tool_call",
      toolName: call.tool,
      toolCallId: "direct-1",
      input: call.input,
    } as never)) as { block?: boolean; reason?: string } | undefined;
    assert.equal(direct?.block, true, "the direct call is blocked");
    assert.match(direct?.reason ?? "", call.gate);

    const nested = await fake.nestedExecutor("script-1", succeed)(call.tool, call.input);
    assert.equal(nested.blocked, true, "the nested call is blocked");
    assert.match(nested.reason ?? "", call.gate);
    assert.deepEqual(fake.ui.calls, [], "no prompt was shown");
  });
}

test("headless: a push the delivery mode forbids is blocked, directly and from a script", async () => {
  const fake = setup("pull-request");
  const input = { command: "git push origin main" };
  const direct = (await fake.emit({
    type: "tool_call",
    toolName: "bash",
    toolCallId: "direct-1",
    input,
  } as never)) as { block?: boolean; reason?: string } | undefined;
  assert.equal(direct?.block, true);
  assert.match(direct?.reason ?? "", /push\.delivery-mode/);
  const nested = await fake.nestedExecutor("script-1", succeed)("bash", input);
  assert.equal(nested.blocked, true);
  assert.match(nested.reason ?? "", /push\.delivery-mode/);
  assert.deepEqual(fake.ui.calls, [], "no prompt was shown");
});

test("headless: devsys_request_approval is refused rather than approving by itself", async () => {
  const fake = setup();
  const tool = fake.tools.get("devsys_request_approval");
  assert.ok(tool, "the approval tool is registered");
  const result = await tool.execute(
    "call-1",
    { gate: "git.force-push", command: "git push --force", why: "test" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(result.isError, true);
});
