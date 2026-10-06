import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { registerGitGuard } from "../../src/gates/git-guard.ts";
import { createRequestApprovalTool } from "../../src/gates/request-approval-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");

const setup = (hasUI: boolean) => {
  const fake = createFakePi({ hasUI, cwd: mkdtempSync(join(tmpdir(), "devsys-guard-")) });
  const approvals = createApprovalStore(fake.api);
  registerGitGuard({ pi: fake.api, approvals, now });
  const tool = createRequestApprovalTool({ pi: fake.api, approvals, now });
  const bash = (command: string, id = "call-1") =>
    fake.emit({ type: "tool_call", toolName: "bash", toolCallId: id, input: { command } } as never);
  const logPath = join(fake.ctx.cwd, "docs", "decisions", "2026-10.md");
  return { fake, approvals, tool, bash, logPath };
};

test("git push --force with no UI is blocked with an instructive reason", async () => {
  const { bash } = setup(false);
  const result = (await bash("git push --force")) as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.equal(
    result.reason,
    "hard stop git.force-push: requires user approval; run interactively",
  );
});

test("with an approving user the command is allowed and the approval is logged", async () => {
  const { fake, bash, logPath } = setup(true);
  fake.ui.confirmResponses.push(true);
  assert.equal(await bash("git push --force"), undefined);
  const log = readFileSync(logPath, "utf8");
  assert.match(log, /### 2026-10-06T17:12:00Z · git\.force-push · hard · user/);
  assert.match(log, /\*\*Scope:\*\* once \(call-1\)/);
  assert.equal(fake.ui.calls.filter((c) => c.kind === "confirm").length, 1);
});

test("a declining user blocks the command and nothing is logged", async () => {
  const { fake, bash, logPath } = setup(true);
  fake.ui.confirmResponses.push(false);
  const result = (await bash("git reset --hard")) as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.match(result.reason, /declined/);
  assert.equal(existsSync(logPath), false);
});

test("ordinary commands pass with no UI interaction", async () => {
  const { fake, bash } = setup(false);
  assert.equal(await bash("git status"), undefined);
  assert.equal(fake.ui.calls.length, 0);
});

test("non-bash tool calls are ignored", async () => {
  const { fake } = setup(false);
  const result = await fake.emit({
    type: "tool_call",
    toolName: "read",
    toolCallId: "r",
    input: { path: "x" },
  } as never);
  assert.equal(result, undefined);
});

test("devsys_request_approval pre-approves exactly one run of the exact command", async () => {
  const { fake, tool, bash } = setup(true);
  fake.ui.confirmResponses.push(true);
  const granted = await tool.execute(
    "ask-1",
    { gate: "git.force-push", command: "git push --force", why: "rebased feature branch" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.notEqual(granted.isError, true);
  assert.equal(await bash("git push --force"), undefined);
  const uiCallsAfterFirst = fake.ui.calls.length;
  const second = (await bash("git push --force", "call-2")) as { block: boolean };
  assert.equal(
    second.block,
    true,
    "approval is single-use; the second run asks again and the fake declines",
  );
  assert.ok(fake.ui.calls.length > uiCallsAfterFirst);
});

test("a different command text does not use a pre-approval", async () => {
  const { fake, tool, bash } = setup(true);
  fake.ui.confirmResponses.push(true);
  await tool.execute(
    "ask-1",
    { gate: "git.force-push", command: "git push --force origin a", why: "x" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  const result = (await bash("git push --force origin b")) as { block: boolean };
  assert.equal(result.block, true);
});

test("devsys_request_approval is unavailable headless and rejects soft gates", async () => {
  const { fake, tool } = setup(false);
  const headless = await tool.execute(
    "a",
    { gate: "git.force-push", command: "git push -f", why: "x" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(headless.isError, true);
  assert.match(JSON.stringify(headless.content), /unavailable headless/);
  const soft = await tool.execute(
    "b",
    { gate: "tdd.red-first", command: "x", why: "x" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(soft.isError, true);
});

test("approvals survive a rebuild from session entries and used ones stay used", async () => {
  const { fake, approvals, tool, bash } = setup(true);
  fake.ui.confirmResponses.push(true);
  await tool.execute(
    "ask",
    { gate: "git.force-push", command: "git push -f", why: "x" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  approvals.rebuildFrom(fake.entries);
  assert.equal(await bash("git push -f"), undefined);
  approvals.rebuildFrom(fake.entries);
  const again = (await bash("git push -f", "call-2")) as { block: boolean };
  assert.equal(again.block, true);
});

test("credentials in the command never reach the logged departure", async () => {
  const { fake, bash, logPath } = setup(true);
  fake.ui.confirmResponses.push(true);
  await bash("git push https://u:ghp_abcdefghijklmnopqrstuvwx@h/r --force");
  const log = readFileSync(logPath, "utf8");
  assert.ok(!log.includes("ghp_"));
  assert.ok(log.includes("[redacted]"));
});
