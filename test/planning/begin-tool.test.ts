import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SliceRef } from "../../src/core/types.ts";
import { createBeginWorkTool } from "../../src/planning/begin-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const setup = (cwd = "/tmp") => {
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  const tool = createBeginWorkTool({ state });
  return {
    cwd,
    state,
    run: () => tool.execute("c", {} as never, undefined, undefined, fake.ctx as never),
  };
};

test("after planning with an active slice, begin moves to implementing", async () => {
  const { state, run } = setup();
  state.update((s) => ({ ...s, phase: "planning", activeSlice: "s1" as SliceRef }));
  const r = await run();
  assert.notEqual(r.isError, true);
  assert.equal(state.get().phase, "implementing");
});

test("outside planning, or with no slice, begin changes nothing and says to size the work", async () => {
  const { state, run } = setup();
  const idle = await run();
  assert.equal(idle.isError, true);
  assert.equal(state.get().phase, "idle");
  state.update((s) => ({ ...s, phase: "reviewing", activeSlice: "s1" as SliceRef }));
  assert.equal((await run()).isError, true);
  assert.equal(state.get().phase, "reviewing");
});

test("begin while already implementing is a harmless success, so prompts can call it at the approval point", async () => {
  const { state, run } = setup();
  state.update((s) => ({ ...s, phase: "implementing", activeSlice: "s1" as SliceRef }));
  const r = await run();
  assert.notEqual(r.isError, true);
  assert.equal(state.get().phase, "implementing");
});

const text = (r: { content: readonly { type: string }[] }): string =>
  r.content.map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("\n");
const file = (cwd: string, path: string) => {
  mkdirSync(join(cwd, path, ".."), { recursive: true });
  writeFileSync(join(cwd, path), "x");
};
const planning = (t: ReturnType<typeof setup>, sizing: "change" | "capability" | "product") =>
  t.state.update((s) => ({ ...s, phase: "planning", sizing, activeSlice: "s1" as SliceRef }));

test("begin lists the recommended planning artifacts that have no file and no recorded skip", async () => {
  const t = setup(mkdtempSync(join(tmpdir(), "begin-")));
  planning(t, "capability");
  const out = text(await t.run());
  assert.equal(t.state.get().phase, "implementing", "listing never blocks");
  assert.match(
    out,
    /no file and no recorded skip: brief-lite \(docs\/product\/brief.md\), journeys \(docs\/product\/journeys.md\), event-model \(docs\/event-model\/\)/,
  );
  assert.match(out, /artifact\.skipped:<artifact>/);
});

test("an artifact with its file, or a recorded skip, is not listed", async () => {
  const t = setup(mkdtempSync(join(tmpdir(), "begin-")));
  planning(t, "capability");
  file(t.cwd, "docs/product/brief.md");
  file(t.cwd, "docs/event-model/slice-1.yaml");
  t.state.update((s) => ({
    ...s,
    openDepartures: [
      {
        id: "d1",
        gate: "artifact.skipped:journeys",
        tier: "soft",
        default: "x",
        chosen: "x",
        why: "y",
        costIfWrong: "z",
        approver: "agent",
        scope: { kind: "session" },
        recordedAt: "2026-10-06T10:00:00Z",
      } as never,
    ],
  }));
  const out = text(await t.run());
  assert.doesNotMatch(out, /no recorded skip/);
  assert.match(out, /Phase: implementing/);
});

test("work that needs no planning files lists nothing", async () => {
  const t = setup(mkdtempSync(join(tmpdir(), "begin-")));
  planning(t, "change");
  assert.doesNotMatch(text(await t.run()), /recorded skip/);
});

test("a product-sized plan also lists the decision register, architecture and lens review", async () => {
  const t = setup(mkdtempSync(join(tmpdir(), "begin-")));
  planning(t, "product");
  assert.match(
    text(await t.run()),
    /brief .*, decision-register .*, journeys .*, event-model .*, architecture .*, lens-review \(/,
  );
});
