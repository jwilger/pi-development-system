import assert from "node:assert/strict";
import { test } from "node:test";
import developmentSystem, { createDevelopmentSystem } from "../extensions/development-system.ts";
import { createFakePi } from "./harness/fake-pi.ts";

test("loading registers devsys-status and the session_start/before_agent_start handlers", () => {
  const fake = createFakePi();
  developmentSystem(fake.api);
  assert.ok(fake.commands.has("devsys-status"));
  assert.ok((fake.handlers.get("session_start") ?? []).length > 0);
  assert.ok((fake.handlers.get("before_agent_start") ?? []).length > 0);
});

test("session_start sets the devsys status line", async () => {
  const fake = createFakePi();
  developmentSystem(fake.api);
  await fake.emit({ type: "session_start", reason: "startup" });
  const call = fake.ui.calls.find((c) => c.kind === "setStatus");
  assert.equal(call?.args[0], "devsys");
  assert.equal(call?.args[1], "devsys: idle · jev unknown");
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
