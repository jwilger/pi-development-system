import assert from "node:assert/strict";
import { test } from "node:test";
import developmentSystem, { createDevelopmentSystem } from "../extensions/development-system.ts";
import { createFakePi } from "./harness/fake-pi.ts";

test("loading registers devsys-status and the session_start/before_agent_start handlers", () => {
  const fake = createFakePi();
  developmentSystem(fake.api);
  assert.ok(fake.commands.has("devsys-status"));
  assert.ok(fake.commands.has("devsys-ci"));
  assert.ok((fake.handlers.get("session_start") ?? []).length > 0);
  assert.ok((fake.handlers.get("before_agent_start") ?? []).length > 0);
});

test("session_start sets the devsys status line", async () => {
  const fake = createFakePi();
  developmentSystem(fake.api);
  await fake.emit({ type: "session_start", reason: "startup" });
  const call = fake.ui.calls.find((c) => c.kind === "setStatus");
  assert.equal(call?.args[0], "devsys");
  assert.equal(call?.args[1], "devsys: idle · jev offline");
});

test("before_agent_start puts the non-negotiables into the development-system section", async () => {
  const fake = createFakePi();
  developmentSystem(fake.api);
  const options = { sections: {} as Record<string, string> };
  await fake.emit({
    type: "before_agent_start",
    prompt: "hi",
    systemPrompt: "",
    systemPromptOptions: options,
  } as never);
  assert.match(options.sections["development-system"] ?? "", /Never rewrite pushed history/);
});

test("/devsys-status notifies with the status report", async () => {
  const fake = createFakePi();
  developmentSystem(fake.api);
  await fake.commands.get("devsys-status")?.handler("", fake.ctx as never);
  const call = fake.ui.calls.find((c) => c.kind === "notify");
  assert.match(String(call?.args[0]), /phase: idle/);
});

test("a state update refreshes the status line using the last seen context", async () => {
  const fake = createFakePi();
  const { state } = createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start", reason: "startup" });
  state.update((s) => ({ ...s, phase: "planning", jev: "online" }));
  const statuses = fake.ui.calls.filter((c) => c.kind === "setStatus").map((c) => c.args[1]);
  assert.equal(statuses.at(-1), "devsys: planning · jev online");
});

test("loading registers the departure and approval tools and guards force pushes", async () => {
  const fake = createFakePi({ hasUI: false });
  developmentSystem(fake.api);
  assert.ok(fake.tools.has("devsys_record_departure"));
  assert.ok(fake.tools.has("devsys_request_approval"));
  assert.ok(fake.tools.has("devsys_review_start"));
  assert.ok(fake.tools.has("devsys_review_record"));
  const result = (await fake.emit({
    type: "tool_call",
    toolName: "bash",
    toolCallId: "c",
    input: { command: "git push --force" },
  } as never)) as { block: boolean };
  assert.equal(result.block, true);
});

test("the context handler appends the departure tail at the end only when there is something to say", async () => {
  const fake = createFakePi();
  const { state } = createDevelopmentSystem(fake.api);
  const messages = [{ role: "user", content: "hi", timestamp: 1 }];
  assert.equal(await fake.emit({ type: "context", messages } as never), undefined);
  state.update((s) => ({ ...s, phase: "implementing" }));
  const result = (await fake.emit({ type: "context", messages } as never)) as {
    messages: Array<{ content: string }>;
  };
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[1]?.content ?? "", /phase: implementing/);
});

test("session_start shows the Jev model when a classifier credential exists", async () => {
  const fake = createFakePi({ classifiers: ["typesafe/jev-latest"] });
  developmentSystem(fake.api);
  await fake.emit({ type: "session_start", reason: "startup" });
  const last = fake.ui.calls.filter((c) => c.kind === "setStatus").at(-1);
  assert.equal(last?.args[1], "devsys: idle · jev online (typesafe/jev-latest)");
});

test("session_start on a resumed session keeps persisted phase and departures", async () => {
  const fake = createFakePi();
  const { state } = createDevelopmentSystem(fake.api);
  const departure = {
    id: "dep-1",
    gate: "tests.weaken",
    tier: "soft",
    default: "never weaken tests",
    chosen: "remove obsolete test",
    why: "feature removed",
    costIfWrong: "lost coverage",
    approver: "agent",
    scope: { kind: "session" },
    recordedAt: "2026-10-06T17:12:00Z",
  };
  fake.api.appendEntry("devsys-state", {
    phase: "implementing",
    openDepartures: [departure],
    jev: "online",
  });
  await fake.emit({ type: "session_start", reason: "resume" });
  assert.equal(state.get().phase, "implementing");
  assert.equal(state.get().openDepartures.length, 1);
});

test("session_start detects the repository's language profiles into state", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const cwd = mkdtempSync(join(tmpdir(), "devsys-ext-"));
  writeFileSync(join(cwd, "Cargo.toml"), "");
  const fake = createFakePi({ cwd });
  const { state } = createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start", reason: "startup" });
  assert.deepEqual(state.get().profiles, ["rust"]);
});

test("a configured profiles.override wins over detection", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const cwd = mkdtempSync(join(tmpdir(), "devsys-ext-"));
  writeFileSync(join(cwd, "Cargo.toml"), "");
  writeFileSync(join(cwd, ".development-system.toml"), '[profiles]\noverride = ["typescript"]\n');
  const fake = createFakePi({ cwd });
  const { state } = createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start", reason: "startup" });
  assert.deepEqual(state.get().profiles, ["typescript"]);
});

test("the red-first, lint-suppression and test-evidence modules are wired", async () => {
  const fake = createFakePi({ hasUI: false });
  const { state } = createDevelopmentSystem(fake.api);
  state.update((s) => ({ ...s, phase: "implementing" }));
  const blocked = (await fake.emit({
    type: "tool_call",
    toolName: "write",
    toolCallId: "c",
    input: { path: "src/new.ts", content: "// @ts-ignore\nexport {};\n" },
  } as never)) as { block: boolean; reason: string } | undefined;
  assert.equal(blocked?.block, true);
  await fake.emit({
    type: "tool_result",
    toolName: "bash",
    toolCallId: "c2",
    input: { command: "npm test" },
    content: [{ type: "text", text: "1 failed\n\nCommand exited with code 1" }],
    isError: true,
    details: undefined,
  } as never);
  assert.equal(state.get().lastTestRun?.exitCode, 1);
});

test("the turn verifier is wired to turn_end and stays silent with Jev unavailable", async () => {
  const fake = createFakePi({ hasUI: false });
  const { state } = createDevelopmentSystem(fake.api);
  assert.ok((fake.handlers.get("turn_end") ?? []).length > 0);
  state.update((s) => ({ ...s, phase: "implementing" }));
  const result = await fake.emit({
    type: "turn_end",
    outcome: "completed",
    turnIndex: 0,
    message: { role: "assistant", content: [{ type: "text", text: "All tests pass." }] },
    toolResults: [],
  } as never);
  assert.equal(result, undefined);
});

test("a compaction resyncs the working state through the extension", async () => {
  const fake = createFakePi({ hasUI: false });
  const { state } = createDevelopmentSystem(fake.api);
  state.update((s) => ({ ...s, phase: "implementing" }));
  await fake.emit({ type: "session_compact", reason: "manual", willRetry: false } as never);
  assert.match(JSON.stringify(fake.sentMessages), /phase: implementing/);
});

test("the context tail carries the cadence line when the last push is older than cadence.push_minutes", async () => {
  const fake = createFakePi({ hasUI: false });
  const { state } = createDevelopmentSystem(fake.api);
  const old = new Date(Date.now() - 90 * 60_000).toISOString();
  state.update((s) => ({ ...s, phase: "implementing", lastPushAt: old }));
  const result = (await fake.emit({ type: "context", messages: [] } as never)) as {
    messages: Array<{ content: string }>;
  };
  assert.match(result.messages.at(-1)?.content ?? "", /9\d min since last push/);
});
