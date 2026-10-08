import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDeparture } from "../../src/core/departure.ts";
import type { Exec } from "../../src/core/exec.ts";
import { closeSlice } from "../../src/core/lifecycle.ts";
import { type DevsysState, isParseError, type Phase, type SliceRef } from "../../src/core/types.ts";
import { createFinishSliceTool, registerSliceClose } from "../../src/planning/slice-close.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

type World = {
  mode?: string;
  phase?: Phase;
  dirty?: boolean;
  ahead?: number;
  waived?: boolean;
  satisfied?: boolean;
  noUpstream?: boolean;
  hasUI?: boolean;
};

const setup = (w: World = {}) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-close-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version = 1\n\n[delivery]\nmode = "${w.mode ?? "trunk"}"\n`,
  );
  const fake = createFakePi({ hasUI: w.hasUI ?? false, cwd });
  const state = createSessionState(fake.api);
  const slice = "s1" as SliceRef;
  const waiver = parseDeparture({
    id: "d1",
    gate: "review.unsatisfied",
    tier: "soft",
    default: "d",
    chosen: "c",
    why: "w",
    costIfWrong: "x",
    approver: "user",
    scope: { kind: "slice", slice },
    recordedAt: "2026-10-08T00:00:00Z",
  });
  if (isParseError(waiver)) throw new Error(waiver.message);
  state.update(
    (s): DevsysState => ({
      ...s,
      phase: w.phase ?? "delivering",
      sizing: "fix",
      activeSlice: slice,
      openDepartures: w.waived ? [waiver] : [],
      reviews:
        w.satisfied === false
          ? []
          : [
              {
                slice,
                required: 1,
                rounds: [
                  { n: 1, lenses: ["types"], findings: [], reviewedAt: "t", diffDigest: "d" },
                ],
              } as never,
            ],
    }),
  );
  const calls: string[] = [];
  const hooks = { onStatus: (): void => undefined };
  const exec: Exec = async (_c, args) => {
    calls.push(args.join(" "));
    if (args.includes("status")) hooks.onStatus();
    if (args.includes("status")) return { code: 0, stdout: w.dirty ? " M a.ts\n" : "", stderr: "" };
    if (args.includes("rev-list")) {
      return w.noUpstream
        ? { code: 128, stdout: "", stderr: "no upstream" }
        : { code: 0, stdout: `${w.ahead ?? 0}\n`, stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  registerSliceClose({ pi: fake.api, state, exec });
  const result = (command: string, isError = false) =>
    fake.emit({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "c",
      input: { command },
      content: [],
      isError,
      details: undefined,
    } as never);
  const finish = (p: Record<string, unknown> = {}) =>
    createFinishSliceTool({ state, exec }).execute(
      "c",
      p as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
  return { state, result, finish, calls, fake, hooks };
};
const text = (r: { content: readonly { type: string }[] }): string =>
  r.content.map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("\n");

test("a push of a clean tree while delivering closes the slice", async () => {
  const t = setup();
  await t.result("git push origin main");
  assert.equal(t.state.get().phase, "idle");
  assert.equal(t.state.get().activeSlice, undefined);
});

test("a push that leaves this slice's commits unpushed (tags only) does not close it", async () => {
  const t = setup({ ahead: 2 });
  await t.result("git push --tags");
  assert.equal(t.state.get().phase, "delivering");
  const failing = setup({ noUpstream: true });
  await failing.result("git push origin main");
  assert.equal(failing.state.get().phase, "delivering");
});

test("a push without an upstream branch still closes, because pushed means on the remote", async () => {
  const t = setup();
  await t.result("git push origin feature");
  assert.equal(t.state.get().phase, "idle");
  assert.ok(t.calls.some((c) => c.includes("--remotes=origin")));
});

test("a push with uncommitted changes, a failed push or a non-push leaves the slice open", async () => {
  const dirty = setup({ dirty: true });
  await dirty.result("git push origin main");
  assert.equal(dirty.state.get().phase, "delivering");
  const t = setup();
  await t.result("git push origin main", true);
  await t.result("git status");
  assert.equal(t.state.get().phase, "delivering");
});

test("a push while implementing or reviewing, with the review owed, does not close", async () => {
  for (const phase of ["implementing", "reviewing"] as const) {
    const t = setup({ phase, satisfied: false });
    await t.result("git push origin main");
    assert.equal(t.state.get().phase, phase);
  }
});

test("a slice saved as implementing with a satisfied review closes on push, like finish would", async () => {
  for (const phase of ["implementing", "reviewing"] as const) {
    const t = setup({ phase });
    await t.result("git push origin main");
    assert.equal(t.state.get().phase, "idle");
  }
});

test("a slice opened while git was being asked is not closed, and nobody is told it was", async () => {
  const t = setup();
  t.hooks.onStatus = () =>
    t.state.update((s) => ({ ...s, activeSlice: "s2" as SliceRef, phase: "implementing" }));
  await t.result("git push origin main");
  assert.equal(t.state.get().activeSlice, "s2");
  assert.equal(t.state.get().phase, "implementing");
  assert.equal(
    t.fake.sentMessages.some((m) => (m as { customType?: string }).customType === "devsys-slice"),
    false,
  );
});

test("closing tells the model, without starting a turn of its own", async () => {
  const t = setup();
  await t.result("git push origin main");
  const i = t.fake.sentMessages.findIndex(
    (m) => (m as { customType?: string }).customType === "devsys-slice",
  );
  assert.ok(i >= 0, "a devsys-slice message was sent");
  assert.match(String((t.fake.sentMessages[i] as { content: string }).content), /s1/);
  assert.deepEqual(t.fake.sendOptions[i], { triggerTurn: false });
});

test("a push made from a codemode script closes the slice like a direct one", async () => {
  const t = setup();
  const script = t.fake.nestedExecutor("script-1", () => ({ text: "ok", isError: false }));
  await script("bash", { command: "git push origin main" });
  assert.equal(t.state.get().phase, "idle");
});

test("a slice whose review was waived by a departure closes on push from implementing", async () => {
  const t = setup({ phase: "implementing", waived: true, satisfied: false });
  await t.result("git push origin main");
  assert.equal(t.state.get().phase, "idle");
  assert.equal(t.state.get().openDepartures.length, 0);
});

test("in local-only mode the commit closes the slice and a push does not matter", async () => {
  const t = setup({ mode: "local-only" });
  await t.result("git commit -m 'x'");
  assert.equal(t.state.get().phase, "idle");
});

test("in trunk mode a commit alone does not close the slice", async () => {
  const t = setup();
  await t.result("git commit -m 'x'");
  assert.equal(t.state.get().phase, "delivering");
});

test("finish closes a delivered slice: reviewed, clean and pushed", async () => {
  const t = setup();
  const r = await t.finish();
  assert.notEqual(r.isError, true);
  assert.equal(t.state.get().phase, "idle");
  assert.match(text(r), /s1/);
});

test("finish refuses with the reason when unreviewed, dirty or unpushed", async () => {
  const unreviewed = setup({ phase: "implementing", satisfied: false });
  assert.match(text(await unreviewed.finish()), /review/);
  assert.equal(unreviewed.state.get().phase, "implementing");
  const dirty = setup({ dirty: true });
  assert.match(text(await dirty.finish()), /uncommitted/);
  const ahead = setup({ ahead: 2 });
  const r = await ahead.finish();
  assert.equal(r.isError, true);
  assert.match(text(r), /unpushed|not pushed/);
  assert.equal(ahead.state.get().phase, "delivering");
});

test("finish without an active slice says there is nothing to finish", async () => {
  const t = setup();
  t.state.update(closeSlice);
  const r = await t.finish();
  assert.equal(r.isError, true);
});

test("abandon needs a reason and the user's yes; it leaves the working tree alone", async () => {
  const t = setup({ phase: "implementing", dirty: true, satisfied: false, hasUI: true });
  assert.equal((await t.finish({ abandon: true })).isError, true);
  t.fake.ui.confirmResponses.push(false);
  const declined = await t.finish({ abandon: true, reason: "approach dropped" });
  assert.equal(declined.isError, true);
  assert.equal(t.state.get().phase, "implementing");
  t.fake.ui.confirmResponses.push(true);
  const r = await t.finish({ abandon: true, reason: "approach dropped" });
  assert.notEqual(r.isError, true);
  assert.equal(t.state.get().phase, "idle");
  assert.match(text(r), /approach dropped/);
  assert.equal(
    t.calls.some((c) => /checkout|reset|clean|stash/.test(c)),
    false,
  );
});

test("a slice opened while the user was being asked is not closed by the answer about the old one", async () => {
  const t = setup({ hasUI: true, phase: "implementing", satisfied: false });
  t.fake.ui.confirmResponses.push(true);
  const asking = t.finish({ abandon: true, reason: "approach dropped" });
  t.state.update((s) => ({ ...s, activeSlice: "s2" as SliceRef }));
  const r = await asking;
  assert.equal(r.isError, true);
  assert.equal(t.state.get().activeSlice, "s2");
  assert.equal(t.state.get().phase, "implementing");
});

test("a slice opened while finish was asking git is not closed by the old finish", async () => {
  const t = setup();
  t.hooks.onStatus = () =>
    t.state.update((s) => ({ ...s, activeSlice: "s2" as SliceRef, phase: "implementing" }));
  const r = await t.finish();
  assert.equal(r.isError, true);
  assert.equal(t.state.get().activeSlice, "s2");
  assert.equal(t.state.get().phase, "implementing");
});

test("abandon is refused when there is no user to confirm it", async () => {
  const t = setup({ phase: "implementing", satisfied: false });
  const r = await t.finish({ abandon: true, reason: "approach dropped" });
  assert.equal(r.isError, true);
  assert.equal(t.state.get().phase, "implementing");
});

test("in local-only mode finish does not ask whether anything is pushed", async () => {
  const t = setup({ mode: "local-only", noUpstream: true });
  assert.notEqual((await t.finish()).isError, true);
});
