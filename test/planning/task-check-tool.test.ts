import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { READINESS_QUESTIONS } from "../../src/jev/questions/readiness.ts";
import { createTaskCheckTool } from "../../src/planning/task-check-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const RECORD = `## T1 — Trim emails on login
**Goal:** Logging in with a trailing space succeeds.
**Files:** src/auth/login.ts, test/auth/login.test.ts
**Interfaces:** \`normalizeEmail(raw: string): string\`
**First failing test:** test/auth/login.test.ts "trims" asserts login resolves.
**Steps:**
1. Add the failing test.
2. Add normalizeEmail.
3. Call it in login.
**Run:** \`npm test\`
**Expected:** 1 test passes, 0 fail.
**Out of scope:** passwords.
`;

const bool = (probability: number): ClassifierAnswer => ({ type: "bool", probability });
const online = (over: Record<string, number> = {}): Jev => ({
  ask: async () =>
    ok(Object.fromEntries(Object.keys(READINESS_QUESTIONS).map((k) => [k, bool(over[k] ?? 0)]))),
  availability: () => "online",
  model: () => "fake/jev",
});
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};

const setup = (jev: Jev, file: string | undefined) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-task-"));
  mkdirSync(join(cwd, "work"));
  if (file !== undefined) writeFileSync(join(cwd, "work", "T1.md"), file);
  const fake = createFakePi({ cwd });
  const tool = createTaskCheckTool({ jev: () => jev });
  const run = (path: string, id?: string) =>
    tool.execute(
      "c",
      { path, ...(id === undefined ? {} : { id }) } as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
  return { run };
};
const textOf = (r: { content: readonly { type: string; text?: string }[] }): string =>
  r.content.map((c) => c.text ?? "").join("\n");

test("a complete, specific record is ready", async () => {
  const r = await setup(online(), RECORD).run("work/T1.md");
  assert.notEqual(r.isError, true);
  assert.match(textOf(r), /ready/);
});

test("a record missing Run is flagged with the section named", async () => {
  const r = await setup(online(), RECORD.replace(/\*\*Run:\*\*.*\n/, "")).run("work/T1.md");
  assert.equal(r.isError, true);
  assert.match(textOf(r), /missing section: Run/);
});

test("Jev reading it as vague lists what to add; too big says split", async () => {
  const vague = await setup(online({ interfaces: 0.9 }), RECORD).run("work/T1.md");
  assert.match(textOf(vague), /needs-detail/);
  assert.match(textOf(vague), /Interfaces/);
  const run = await setup(online({ check: 0.9, firstFailingTest: 0.9 }), RECORD).run("work/T1.md");
  assert.match(textOf(run), /First failing test, Run and Expected/);
  assert.doesNotMatch(textOf(run), /\bcheck\b|firstFailingTest/);
  const big = await setup(online({ tooBig: 0.9 }), RECORD).run("work/T1.md");
  assert.match(textOf(big), /too-big/);
  assert.match(textOf(big), /split/i);
});

test("Jev offline still checks structure and says the judgement was skipped", async () => {
  const r = await setup(offline, RECORD).run("work/T1.md");
  assert.notEqual(r.isError, true);
  assert.match(textOf(r), /structure ok/i);
  assert.match(textOf(r), /Jev unavailable/);
});

test("an unreadable path and a path outside the repository are errors", async () => {
  const s = setup(online(), undefined);
  assert.equal((await s.run("work/nope.md")).isError, true);
  assert.equal((await s.run("../outside.md")).isError, true);
});

test("a plan file with several records is checked by id", async () => {
  const plan = `# Plan\n\n## Goal and why\n\nText.\n\n${RECORD}\n${RECORD.replace("T1", "T2").replace(/\*\*Run:\*\*.*\n/, "")}`;
  const { run } = setup(online(), plan);
  const first = await run("work/T1.md", "T1");
  assert.match(textOf(first), /T1: ready/);
  const bad = await run("work/T1.md", "T2");
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /missing section: Run/);
  assert.equal((await run("work/T1.md")).isError, true);
});
