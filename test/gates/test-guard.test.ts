import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import { registerTestGuard } from "../../src/gates/test-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");
const TEST_FILE = "test/a.test.ts";
const ORIGINAL = "test('adds', () => {\n  assert.equal(add(1, 2), 3);\n});\n";

const offlineJev: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};
const jevJudging = (weakens: number, motive: string, confidence = 0.9): Jev => ({
  ask: async () =>
    ok({
      weakens: { type: "bool", probability: weakens },
      motive: { type: "choice", choice: motive, probabilities: {}, confidence },
    } satisfies Record<string, ClassifierAnswer>),
  availability: () => "online",
  model: () => "fake/jev",
});

const setup = (jev: Jev, hasUI = false) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-testguard-"));
  mkdirSync(join(cwd, "test"));
  writeFileSync(join(cwd, TEST_FILE), ORIGINAL);
  const fake = createFakePi({ hasUI, cwd });
  const state = createSessionState(fake.api);
  const approvals = createApprovalStore(fake.api);
  registerTestGuard({ pi: fake.api, state, approvals, jev: () => jev, now });
  const record = createRecordDepartureTool({ pi: fake.api, state, now });
  const call = (toolName: string, input: Record<string, unknown>) =>
    fake.emit({ type: "tool_call", toolName, toolCallId: "c1", input } as never) as Promise<
      { block: boolean; reason: string } | undefined
    >;
  return { fake, state, record, call, cwd };
};

test("deleting a test file without a departure is blocked and names the tool and gate", async () => {
  const { call } = setup(offlineJev);
  const r = await call("bash", { command: `rm ${TEST_FILE}` });
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /devsys_record_departure/);
  assert.match(r?.reason ?? "", /tests\.weaken/);
});

test("with a recorded tests.weaken departure the deletion is allowed", async () => {
  const { call, record, cwd } = setup(offlineJev);
  await record.execute(
    "r1",
    {
      gate: "tests.weaken",
      chosen: "remove obsolete test",
      why: "feature removed",
      costIfWrong: "lost coverage",
      scope: "session",
    } as never,
    undefined,
    undefined,
    { cwd } as never,
  );
  assert.equal(await call("bash", { command: `rm ${TEST_FILE}` }), undefined);
});

test("adding .skip via edit is blocked offline", async () => {
  const { call } = setup(offlineJev);
  const r = await call("edit", {
    path: TEST_FILE,
    edits: [{ oldText: "test('adds'", newText: "test.skip('adds'" }],
  });
  assert.equal(r?.block, true);
});

test("an ordinary edit while Jev is offline is allowed", async () => {
  const { call } = setup(offlineJev);
  assert.equal(
    await call("edit", { path: TEST_FILE, edits: [{ oldText: "3", newText: "4" }] }),
    undefined,
  );
});

test("non-test files are ignored", async () => {
  const { call } = setup(offlineJev);
  assert.equal(await call("write", { path: "src/a.ts", content: "" }), undefined);
  assert.equal(await call("bash", { command: "rm src/a.ts" }), undefined);
});

test("pure additions to a test file never need Jev", async () => {
  const { call } = setup(jevJudging(0.99, "gate-gaming"));
  const r = await call("write", { path: TEST_FILE, content: `${ORIGINAL}test('b', () => {});\n` });
  assert.equal(r, undefined);
});

test("adding a skip marker line is not a harmless addition (Rust #[ignore])", async () => {
  const { call } = setup(offlineJev);
  const r = await call("write", { path: TEST_FILE, content: `#[ignore]\n${ORIGINAL}` });
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /tests\.weaken/);
});

test("Jev: weakens ≥ 0.7 with a non-gaming motive requires a departure", async () => {
  const { call } = setup(jevJudging(0.8, "requirement-change"));
  const r = await call("write", {
    path: TEST_FILE,
    content: "test('adds', () => {\n  assert.ok(add(1, 2));\n});\n",
  });
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /tests\.weaken/);
  assert.doesNotMatch(r?.reason ?? "", /hard stop/);
});

test("Jev: weakens < 0.7 allows the edit", async () => {
  const { call } = setup(jevJudging(0.2, "refactor"));
  assert.equal(
    await call("write", {
      path: TEST_FILE,
      content: "test('adds', () => {\n  assert.equal(add(2, 1), 3);\n});\n",
    }),
    undefined,
  );
});

test("Jev: gate-gaming escalates to a hard stop (headless → blocked)", async () => {
  const { call } = setup(jevJudging(0.9, "gate-gaming"));
  const r = await call("write", { path: TEST_FILE, content: "test('adds', () => {});\n" });
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /hard stop tests\.weaken/);
});

test("Jev: gate-gaming with a UI asks the user; approval allows and is logged as hard", async () => {
  const { fake, call } = setup(jevJudging(0.9, "gate-gaming"), true);
  fake.ui.confirmResponses.push(true);
  const r = await call("write", { path: TEST_FILE, content: "test('adds', () => {});\n" });
  assert.equal(r, undefined);
  assert.equal(fake.entries.filter((e) => e.customType === "devsys-departure").length, 1);
});

test("a once-scoped departure covers exactly one weakening", async () => {
  const { call, record, cwd } = setup(offlineJev);
  await record.execute(
    "r1",
    { gate: "tests.weaken", chosen: "x", why: "y", costIfWrong: "z", scope: "once" } as never,
    undefined,
    undefined,
    { cwd } as never,
  );
  assert.equal(await call("bash", { command: `rm ${TEST_FILE}` }), undefined);
  assert.equal(
    ((await call("bash", { command: `rm ${TEST_FILE}` })) as { block: boolean }).block,
    true,
  );
});

test("a deterministic weakening signal plus a gate-gaming motive is a hard stop even when weakens is low", async () => {
  const { call } = setup(jevJudging(0.3, "gate-gaming"));
  const r = await call("bash", { command: `rm ${TEST_FILE}` });
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /hard stop tests\.weaken/);
});

test("Jev never receives secrets from the changed test file", async () => {
  const seen: string[] = [];
  const spy: Jev = {
    ask: async (state) => {
      seen.push(JSON.stringify(state));
      return err({ kind: "no-model" });
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  const { call } = setup(spy);
  await call("write", {
    path: TEST_FILE,
    content: "const TOKEN=ghp_abcdefghijklmnopqrstuv1234;\n",
  });
  assert.ok(seen.length > 0);
  assert.doesNotMatch(seen.join(""), /ghp_abcdefghijklmnop/);
});

test("one once-scoped departure covers every test path in a single command", async () => {
  const { call, record, cwd } = setup(offlineJev);
  writeFileSync(join(cwd, "test/b.test.ts"), ORIGINAL);
  await record.execute(
    "r1",
    { gate: "tests.weaken", chosen: "x", why: "y", costIfWrong: "z", scope: "once" } as never,
    undefined,
    undefined,
    { cwd } as never,
  );
  assert.equal(await call("bash", { command: `rm ${TEST_FILE} test/b.test.ts` }), undefined);
});

test("shell bypass forms (glob, mv, redirect truncation) are blocked without a departure", async () => {
  const { call } = setup(offlineJev);
  for (const command of ["rm test/*.ts", `mv ${TEST_FILE} /tmp/x`, `: > ${TEST_FILE}`]) {
    const r = await call("bash", { command });
    assert.equal(r?.block, true, command);
  }
});

test("@-prefixed, absolute and file:// paths are guarded like the plain path", async () => {
  const { call, cwd } = setup(offlineJev);
  const skip = [{ oldText: "test('adds'", newText: "test.skip('adds'" }];
  for (const path of [`@${TEST_FILE}`, join(cwd, TEST_FILE), `file://${join(cwd, TEST_FILE)}`]) {
    const r = await call("edit", { path, edits: skip });
    assert.equal(r?.block, true, path);
  }
  const written = await call("write", { path: `@${TEST_FILE}`, content: "" });
  assert.equal(written?.block, true);
});

test("a multi-line bash script that deletes a test later is blocked", async () => {
  const { call } = setup(offlineJev);
  const r = await call("bash", { command: `echo start\nrm ${TEST_FILE}\necho done` });
  assert.equal(r?.block, true);
});

test("commenting out the whole file or adding it.only is not a harmless addition", async () => {
  const { call } = setup(offlineJev);
  const commented = await call("write", { path: TEST_FILE, content: `/*\n${ORIGINAL}*/\n` });
  assert.equal(commented?.block, true);
  const only = await call("write", {
    path: TEST_FILE,
    content: `${ORIGINAL}it.only('x', () => {});\n`,
  });
  assert.equal(only?.block, true);
});

test("removing a path that does not exist touches nothing and is allowed", async () => {
  const { call } = setup(offlineJev);
  assert.equal(await call("bash", { command: "rm -f test/missing.test.ts" }), undefined);
});

test("in-place rewrites go to Jev, not to the deletion rule; logs under test dirs are ignored", async () => {
  const { call } = setup(jevJudging(0.05, "legitimate"));
  assert.equal(
    await call("bash", { command: `sed -i 's/adds/adds two/' ${TEST_FILE}` }),
    undefined,
  );
  assert.equal(await call("bash", { command: "npm test 2>test/err.log" }), undefined);
  assert.equal(await call("bash", { command: "rm -rf tests/__pycache__" }), undefined);
  const weak = setup(jevJudging(0.95, "convenience")).call;
  const blocked = await weak("bash", { command: `sed -i 's/assert/# assert/' ${TEST_FILE}` });
  assert.equal(blocked?.block, true);
});

test("cd to a computed directory does not hide a deletion", async () => {
  const { call } = setup(offlineJev);
  const r = await call("bash", {
    command: `cd "$(git rev-parse --show-toplevel)" && rm ${TEST_FILE}`,
  });
  assert.equal(r?.block, true);
});
