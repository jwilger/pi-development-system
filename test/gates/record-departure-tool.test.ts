import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const setup = () => {
  const fake = createFakePi({ cwd: mkdtempSync(join(tmpdir(), "devsys-tool-")) });
  const state = createSessionState(fake.api);
  const tool = createRecordDepartureTool({
    pi: fake.api,
    state,
    now: () => new Date("2026-10-06T17:12:00Z"),
  });
  const run = (params: Record<string, unknown>) =>
    tool.execute("call-1", params as never, undefined, undefined, fake.ctx as never);
  return { fake, state, tool, run };
};

const soft = {
  gate: "tdd.red-first",
  chosen: "edit first; pure rename",
  why: "structural change",
  costIfWrong: "behaviour slips through",
  scope: "session",
};

test("a soft gate departure writes one decision-log entry and one devsys-departure entry", async () => {
  const { fake, state, run } = setup();
  const result = await run(soft);
  assert.notEqual(result.isError, true);
  const log = readFileSync(join(fake.ctx.cwd, "docs", "decisions", "2026-10.md"), "utf8");
  assert.equal(log.match(/^### /gm)?.length, 1);
  assert.match(log, /### 2026-10-06T17:12:00Z · tdd\.red-first · soft · agent/);
  assert.equal(fake.entries.filter((e) => e.customType === "devsys-departure").length, 1);
  assert.equal(state.get().openDepartures.length, 1);
  assert.match(JSON.stringify(result.content), /tdd\.red-first/);
});

test("slice scope uses the active slice and fails when none is active", async () => {
  const { state, run } = setup();
  const failed = await run({ ...soft, scope: "slice" });
  assert.equal(failed.isError, true);
  state.update((s) => ({ ...s, activeSlice: "I1.3" as never }));
  const ok = await run({ ...soft, scope: "slice" });
  assert.notEqual(ok.isError, true);
  assert.deepEqual(state.get().openDepartures[0]?.scope, { kind: "slice", slice: "I1.3" });
});

test("a hard gate is refused with instructions to request approval", async () => {
  const { fake, run } = setup();
  const result = await run({ ...soft, gate: "git.force-push" });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /devsys_request_approval/);
  assert.equal(fake.entries.length, 0);
});

test("an unregistered or malformed gate is refused and lists valid ids", async () => {
  const { run } = setup();
  for (const gate of ["nope.nothing", "Bad Gate"]) {
    const result = await run({ ...soft, gate });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /tdd\.red-first/);
  }
});

test("a qualified artifact gate is accepted", async () => {
  const { run } = setup();
  const result = await run({ ...soft, gate: "artifact.skipped:brief" });
  assert.notEqual(result.isError, true);
});
