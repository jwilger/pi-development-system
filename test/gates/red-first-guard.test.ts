import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Phase, SliceRef } from "../../src/core/types.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import { registerRedFirstGuard } from "../../src/gates/red-first-guard.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");
const run = (exitCode: number) => ({ at: "2026-10-06T17:00:00Z", exitCode, summary: "s" });

const setup = (init: { phase?: Phase; exitCode?: number; slice?: string } = {}) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-red-"));
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, "src/x.ts"), "export const x = 1;\n");
  const fake = createFakePi({ hasUI: false, cwd });
  const state = createSessionState(fake.api);
  state.update((s) => ({
    ...s,
    phase: init.phase ?? "implementing",
    ...(init.exitCode === undefined ? {} : { lastTestRun: run(init.exitCode) }),
    ...(init.slice === undefined ? {} : { activeSlice: init.slice as SliceRef }),
  }));
  registerRedFirstGuard({ pi: fake.api, state });
  const record = createRecordDepartureTool({ pi: fake.api, state, now });
  const call = (toolName: string, input: Record<string, unknown>) =>
    fake.emit({ type: "tool_call", toolName, toolCallId: "c1", input } as never) as Promise<
      { block: boolean; reason: string } | undefined
    >;
  const depart = (scope: string) =>
    record.execute(
      "r1",
      {
        gate: "tdd.red-first",
        chosen: "edit without a failing test",
        why: "behaviour-preserving refactor with green coverage",
        costIfWrong: "an unnoticed regression",
        scope,
      } as never,
      undefined,
      undefined,
      { cwd } as never,
    );
  return { call, depart, state };
};

const edit = { path: "src/x.ts", edits: [{ oldText: "1", newText: "2" }] };

test("editing source after a green run requires a tdd.red-first departure", async () => {
  const { call } = setup({ exitCode: 0 });
  const r = await call("edit", edit);
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /tdd\.red-first/);
  assert.match(r?.reason ?? "", /devsys_record_departure/);
  assert.match(r?.reason ?? "", /failing test/);
});

test("editing source with no test run yet requires a departure", async () => {
  const { call } = setup();
  assert.equal((await call("write", { path: "src/x.ts", content: "x" }))?.block, true);
});

test("a red run observed means source edits are allowed", async () => {
  const { call } = setup({ exitCode: 1 });
  assert.equal(await call("edit", edit), undefined);
  assert.equal(await call("write", { path: "src/new.ts", content: "x" }), undefined);
});

test("tests, docs, config and generated files are exempt", async () => {
  const { call } = setup({ exitCode: 0 });
  for (const path of ["test/a.test.ts", "docs/a.md", "package.json", "dist/a.js", "README.md"]) {
    assert.equal(await call("write", { path, content: "x" }), undefined, path);
  }
});

test("only implementing is gated", async () => {
  for (const phase of ["idle", "planning", "intake", "reviewing", "delivering"] as const) {
    const { call } = setup({ phase, exitCode: 0 });
    assert.equal(await call("edit", edit), undefined, phase);
  }
});

test("bash and read calls are not gated", async () => {
  const { call } = setup({ exitCode: 0 });
  assert.equal(await call("bash", { command: "sed -i s/1/2/ src/x.ts" }), undefined);
  assert.equal(await call("read", { path: "src/x.ts" }), undefined);
});

test("a slice departure covers every edit in the slice", async () => {
  const { call, depart } = setup({ exitCode: 0, slice: "s1" });
  await depart("slice");
  assert.equal(await call("edit", edit), undefined);
  assert.equal(await call("edit", edit), undefined);
});

test("a slice departure for another slice does not apply", async () => {
  const { call, depart, state } = setup({ exitCode: 0, slice: "s1" });
  await depart("slice");
  state.update((s) => ({ ...s, activeSlice: "s2" as SliceRef }));
  assert.equal((await call("edit", edit))?.block, true);
});

test("a once departure is spent by one edit", async () => {
  const { call, depart } = setup({ exitCode: 0 });
  await depart("once");
  assert.equal(await call("edit", edit), undefined);
  assert.equal((await call("edit", edit))?.block, true);
});

test("the block reason lists the exemptions to name in the departure", async () => {
  const { call } = setup({ exitCode: 0 });
  const r = await call("edit", edit);
  assert.match(r?.reason ?? "", /behaviour-preserving refactor/);
  assert.match(r?.reason ?? "", /functionality removal/);
});
