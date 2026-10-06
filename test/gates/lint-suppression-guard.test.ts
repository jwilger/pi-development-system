import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerLintSuppressionGuard } from "../../src/gates/lint-suppression-guard.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");

const setup = () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-lint-"));
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, "src/x.ts"), "export const x = 1;\n");
  const fake = createFakePi({ hasUI: false, cwd });
  const state = createSessionState(fake.api);
  registerLintSuppressionGuard({ pi: fake.api, state });
  const record = createRecordDepartureTool({ pi: fake.api, state, now });
  const call = (toolName: string, input: Record<string, unknown>) =>
    fake.emit({ type: "tool_call", toolName, toolCallId: "c1", input } as never) as Promise<
      { block: boolean; reason: string } | undefined
    >;
  const depart = (scope: string) =>
    record.execute(
      "r1",
      {
        gate: "lints.suppression",
        chosen: "suppress the lint here",
        why: "third-party type is wrong",
        costIfWrong: "one hidden lint finding",
        scope,
      } as never,
      undefined,
      undefined,
      { cwd } as never,
    );
  return { call, depart, state };
};

test("writing a bare biome-ignore is blocked and names the gate and tool", async () => {
  const { call } = setup();
  const r = await call("write", {
    path: "src/x.ts",
    content: "// biome-ignore lint/x\nexport const x = 1;\n",
  });
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /lints\.suppression/);
  assert.match(r?.reason ?? "", /devsys_record_departure/);
  assert.match(r?.reason ?? "", /biome-ignore/);
});

test("an edit adding @ts-ignore without a reason is blocked", async () => {
  const { call } = setup();
  const r = await call("edit", {
    path: "src/x.ts",
    edits: [{ oldText: "export", newText: "// @ts-ignore\nexport" }],
  });
  assert.equal(r?.block, true);
});

test("a suppression with a written reason is allowed", async () => {
  const { call } = setup();
  const r = await call("write", {
    path: "src/x.ts",
    content: "// biome-ignore lint/x: boundary parse of foreign JSON\nexport const x = 1;\n",
  });
  assert.equal(r, undefined);
});

test("docs and config files are not checked", async () => {
  const { call } = setup();
  assert.equal(await call("write", { path: "docs/a.md", content: "// @ts-ignore\n" }), undefined);
  assert.equal(await call("write", { path: "a.json", content: "{}" }), undefined);
});

test("a new file is checked against empty content", async () => {
  const { call } = setup();
  const r = await call("write", {
    path: "src/new.rs",
    content: "#[allow(dead_code)]\nfn f() {}\n",
  });
  assert.equal(r?.block, true);
});

test("an edit that does not touch an existing bare suppression is allowed", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-lint-"));
  mkdirSync(join(cwd, "src"));
  writeFileSync(join(cwd, "src/old.ts"), "// @ts-ignore\nfoo();\n");
  const fake = createFakePi({ hasUI: false, cwd });
  registerLintSuppressionGuard({ pi: fake.api, state: createSessionState(fake.api) });
  const r = await fake.emit({
    type: "tool_call",
    toolName: "edit",
    toolCallId: "c",
    input: { path: "src/old.ts", edits: [{ oldText: "foo()", newText: "bar()" }] },
  } as never);
  assert.equal(r, undefined);
});

test("a recorded lints.suppression departure lets the change through", async () => {
  const { call, depart } = setup();
  await depart("session");
  const r = await call("write", {
    path: "src/x.ts",
    content: "// @ts-ignore\nexport const x = 1;\n",
  });
  assert.equal(r, undefined);
});

test("a once departure is spent by the first allowed call", async () => {
  const { call, depart } = setup();
  await depart("once");
  const input = { path: "src/x.ts", content: "// @ts-ignore\nexport const x = 1;\n" };
  assert.equal(await call("write", input), undefined);
  assert.equal((await call("write", input))?.block, true);
});

test("an edit whose old text does not match is judged on the new text alone", async () => {
  const { call } = setup();
  const r = await call("edit", {
    path: "src/x.ts",
    edits: [{ oldText: "not present", newText: "// eslint-disable-next-line\nfoo();" }],
  });
  assert.equal(r?.block, true);
});
