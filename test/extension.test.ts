import assert from "node:assert/strict";
import { test } from "node:test";
import developmentSystem from "../extensions/development-system.ts";
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
