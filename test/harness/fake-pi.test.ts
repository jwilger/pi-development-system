import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakePi } from "./fake-pi.ts";

test("emit invokes a registered handler and returns its result", async () => {
  const fake = createFakePi();
  const seen: unknown[] = [];
  fake.api.on("tool_call", (event) => {
    seen.push(event);
    return { block: true, reason: "nope" };
  });
  const result = await fake.emit({
    type: "tool_call",
    toolName: "bash",
    input: { command: "ls" },
    toolCallId: "1",
  });
  assert.equal(seen.length, 1);
  assert.deepEqual(result, { block: true, reason: "nope" });
});

test("appendEntry is recorded and visible through sessionManager.getBranch", async () => {
  const fake = createFakePi();
  fake.api.appendEntry("devsys-state", { a: 1 });
  assert.deepEqual(fake.entries, [{ customType: "devsys-state", data: { a: 1 } }]);
  const branch = fake.ctx.sessionManager.getBranch();
  assert.equal(branch.length, 1);
});

test("ui calls are recorded and responses are consumed in order", async () => {
  const fake = createFakePi();
  fake.ui.confirmResponses.push(true, false);
  assert.equal(await fake.ctx.ui.confirm("t", "m"), true);
  assert.equal(await fake.ctx.ui.confirm("t", "m"), false);
  assert.equal(await fake.ctx.ui.confirm("t", "m"), false);
  fake.ctx.ui.setStatus("devsys", "x");
  assert.deepEqual(
    fake.ui.calls.map((c) => c.kind),
    ["confirm", "confirm", "confirm", "setStatus"],
  );
});

test("hasUI false is reflected on the context", () => {
  const fake = createFakePi({ hasUI: false });
  assert.equal(fake.ctx.hasUI, false);
  assert.equal(fake.ui.hasUI, false);
});

test("ctx.hasUI follows later changes to fake.ui.hasUI", () => {
  const fake = createFakePi();
  fake.ui.hasUI = false;
  assert.equal(fake.ctx.hasUI, false);
});

test("emit accepts a per-call hasUI override for headless tests", async () => {
  const fake = createFakePi();
  let seen: boolean | undefined;
  fake.api.on("tool_call", (_e, ctx) => {
    seen = ctx.hasUI;
  });
  await fake.emit(
    { type: "tool_call", toolName: "bash", input: { command: "ls" }, toolCallId: "1" },
    { hasUI: false },
  );
  assert.equal(seen, false);
  assert.equal(fake.ctx.hasUI, true);
});
