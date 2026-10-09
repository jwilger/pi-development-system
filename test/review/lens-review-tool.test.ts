import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Sizing } from "../../src/core/types.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createLensReviewTool } from "../../src/review/lens-review-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const jevWith = (p: Record<string, number>): Jev => ({
  ask: async () =>
    ok(
      Object.fromEntries(
        ["cagan", "torres", "pichler", "perri", "rumelt"].map((l) => [
          l,
          { type: "bool", probability: p[l] ?? 0 } satisfies ClassifierAnswer,
        ]),
      ),
    ),
  availability: () => "online",
  model: () => "fake/jev",
});
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};

const setup = (jev: Jev, sizing: Sizing | undefined, withBrief = true, briefText?: string) => {
  const cwd = mkdtempSync(join(tmpdir(), "lens-"));
  mkdirSync(join(cwd, "docs/product/reviews"), { recursive: true });
  if (withBrief)
    writeFileSync(join(cwd, "docs/product/brief.md"), briefText ?? "# Brief\n\nBuild an app.\n");
  const fake = createFakePi({ cwd });
  const state = createSessionState(fake.api);
  state.update((s) => ({ ...s, ...(sizing === undefined ? {} : { sizing }) }));
  const tool = createLensReviewTool({
    state,
    jev: () => jev,
    now: () => new Date("2026-10-08T12:00:00Z"),
  });
  const run = (params: { brief?: string; round?: number }) =>
    tool.execute("c", params as never, undefined, undefined, fake.ctx as never);
  return { cwd, run };
};
const text = (r: { content: { type: string; text?: string }[] }) => r.content[0]?.text ?? "";

test("a product-sized brief gets all five lenses, as a codemode script plus fallback payloads", async () => {
  const { run } = setup(jevWith({}), "product");
  const r = await run({});
  assert.notEqual(r.isError, true);
  const out = text(r);
  for (const l of ["cagan", "torres", "pichler", "perri", "rumelt"]) {
    assert.ok(out.includes(`lens-${l}`), l);
  }
  assert.match(out, /codemode/);
  assert.match(out, /agent_spawn/);
  assert.ok(out.includes("docs/product/reviews/2026-10-08-round1.md"));
  assert.ok(out.includes("docs/product/brief.md"));
  // The fallback must name the heading round 2 reads back to find which lenses wrote round 1.
  assert.ok(out.includes("## <lens> — round 1"));
});

test("the lens agents' effort comes from [review] thinking_level, high by default", async () => {
  const { run, cwd } = setup(jevWith({}), "product");
  assert.match(text(await run({})), /"thinkingLevel":\s*"high"/);
  writeFileSync(join(cwd, ".development-system.toml"), '[review]\nthinking_level = "max"\n');
  const out = text(await run({}));
  assert.match(out, /"thinkingLevel":\s*"max"/);
  assert.doesNotMatch(out, /"thinkingLevel":\s*"high"/);
});

test("a capability-sized brief gets only the lenses Jev picks", async () => {
  const { run } = setup(jevWith({ cagan: 0.9, rumelt: 0.8 }), "capability");
  const out = text(await run({}));
  assert.ok(out.includes("lens-cagan") && out.includes("lens-rumelt"));
  assert.equal(out.includes("lens-torres"), false);
  assert.equal(out.includes("lens-perri"), false);
});

test("Jev offline or choosing none falls back to all five and says so", async () => {
  for (const jev of [offline, jevWith({})]) {
    const out = text(await setup(jev, "capability").run({}));
    assert.ok(out.includes("lens-pichler"));
    assert.match(out, /all five/i);
  }
});

test("a missing brief is an error that names the path", async () => {
  const r = await setup(jevWith({}), "product", false).run({});
  assert.equal(r.isError, true);
  assert.match(text(r), /docs\/product\/brief\.md/);
});

test("round 2 needs the round 1 file", async () => {
  const s = setup(jevWith({}), "product");
  const missing = await s.run({ round: 2 });
  assert.equal(missing.isError, true);
  assert.match(text(missing), /round1/);
  writeFileSync(join(s.cwd, "docs/product/reviews/2026-10-08-round1.md"), "x");
  const r = await s.run({ round: 2 });
  assert.notEqual(r.isError, true);
  assert.ok(text(r).includes("docs/product/reviews/2026-10-08-round2.md"));
});

test("round 2 finds a round 1 written on an earlier day and pairs its file with it", async () => {
  const s = setup(jevWith({}), "product");
  writeFileSync(join(s.cwd, "docs/product/reviews/2026-10-07-round1.md"), "x");
  const r = await s.run({ round: 2 });
  assert.notEqual(r.isError, true);
  assert.ok(text(r).includes("docs/product/reviews/2026-10-07-round1.md"));
  assert.ok(text(r).includes("docs/product/reviews/2026-10-07-round2.md"));
});

test("round 2 asks the lenses that wrote round 1, whatever Jev would pick now", async () => {
  const s = setup(jevWith({ rumelt: 0.9 }), "capability");
  writeFileSync(
    join(s.cwd, "docs/product/reviews/2026-10-08-round1.md"),
    "# Lens review — round 1\n\n## cagan — round 1\n\nx\n\n## torres — round 1\n\ny\n",
  );
  const out = text(await s.run({ round: 2 }));
  assert.ok(out.includes("lens-cagan") && out.includes("lens-torres"));
  assert.equal(out.includes("lens-rumelt"), false);
});

test("round 2 finds a lens whose heading is the first line of a hand-written round 1", async () => {
  const s = setup(jevWith({ rumelt: 0.9 }), "capability");
  writeFileSync(
    join(s.cwd, "docs/product/reviews/2026-10-08-round1.md"),
    "## cagan — round 1\n\nx\n",
  );
  const out = text(await s.run({ round: 2 }));
  assert.ok(out.includes("lens-cagan"));
  assert.equal(out.includes("lens-rumelt"), false);
});

test("an absolute brief path is read as given", async () => {
  const s = setup(jevWith({}), "product");
  const r = await s.run({ brief: join(s.cwd, "docs/product/brief.md") });
  assert.notEqual(r.isError, true);
});

test("an unknown round is refused", async () => {
  const r = await setup(jevWith({}), "product").run({ round: 3 });
  assert.equal(r.isError, true);
});

const solutionJev = (p: number): Jev => ({
  ask: async (_state, questions) =>
    ok(
      Object.fromEntries(
        Object.keys(questions).map((k) => [
          k,
          { type: "bool", probability: p } satisfies ClassifierAnswer,
        ]),
      ),
    ),
  availability: () => "online",
  model: () => "fake/jev",
});

test("solution-level detail in the brief is reported as a warning, not an error", async () => {
  const { run } = setup(jevWith({}), "product", true, "# Brief\n\nCall POST /api/orders.\n");
  const r = await run({});
  assert.notEqual(r.isError, true);
  assert.match(text(r), /Brief lint[\s\S]*line 3[\s\S]*POST \/api\/orders/);
});

test("Jev flags a brief that prescribes the solution even when no regex marker matches", async () => {
  const { run } = setup(solutionJev(0.9), "product", true, "# Brief\n\nUse a queue and workers.\n");
  assert.match(text(await run({})), /Brief lint[\s\S]*prescribes the solution/);
});

test("a clean brief produces no lint section", async () => {
  const { run } = setup(solutionJev(0.1), "product");
  assert.equal(text(await run({})).includes("Brief lint"), false);
});
