import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import { registerCommitGuard } from "../../src/gates/commit-guard.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");
const BODY =
  "Slots hold ordered candidates so one committed file works for collaborators with different accounts.";
const GOOD = `feat(config): add matrix\n\n${BODY}`;

const offlineJev: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};
const jevJudging = (rationale: number, mix: number): Jev => ({
  ask: async () =>
    ok({
      rationale: { type: "bool", probability: rationale },
      mix: { type: "bool", probability: mix },
    } satisfies Record<string, ClassifierAnswer>),
  availability: () => "online",
  model: () => "fake/jev",
});

const setup = (jev: Jev, diff = "a.ts | 2 +-") => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-commit-"));
  const fake = createFakePi({ hasUI: false, cwd });
  const state = createSessionState(fake.api);
  const execCalls: string[][] = [];
  registerCommitGuard({
    pi: fake.api,
    state,
    jev: () => jev,
    exec: async (command, args) => {
      execCalls.push([command, ...args]);
      return { code: 0, stdout: diff, stderr: "" };
    },
  });
  const record = createRecordDepartureTool({ pi: fake.api, state, now });
  const bash = (command: string) =>
    fake.emit({
      type: "tool_call",
      toolName: "bash",
      toolCallId: "c1",
      input: { command },
    } as never) as Promise<{ block: boolean; reason: string } | undefined>;
  const depart = (gate: string) =>
    record.execute(
      "r1",
      {
        gate,
        chosen: "x",
        why: "y",
        costIfWrong: "z",
        scope: "session",
      } as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
  return { fake, state, bash, depart, cwd, execCalls };
};

const commit = (message: string) => `git commit -m '${message}'`;

test("a good Conventional Commit with a rationale passes", async () => {
  const { bash } = setup(jevJudging(0.9, 0.1));
  assert.equal(await bash(commit(GOOD)), undefined);
});

test("non-commit commands are ignored and run nothing", async () => {
  const { bash, execCalls } = setup(jevJudging(0.9, 0.1));
  assert.equal(await bash("git status"), undefined);
  assert.equal(execCalls.length, 0);
});

test("a Co-Authored-By trailer is blocked and cannot be departed from", async () => {
  const { bash, depart } = setup(jevJudging(0.9, 0.1));
  const message = `${GOOD}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
  const first = await bash(commit(message));
  assert.equal(first?.block, true);
  assert.match(first?.reason ?? "", /Co-Authored-By/);
  assert.match(first?.reason ?? "", /remove/i);
  await depart("commit.forbidden-trailer");
  assert.equal((await bash(commit(message)))?.block, true);
});

test("a trailer passed via --trailer is also blocked", async () => {
  const { bash } = setup(offlineJev);
  const r = await bash(`git commit -m 'fix: a thing' --trailer 'Co-Authored-By: bot <b@x.y>'`);
  assert.equal(r?.block, true);
});

test("a commit without a body is blocked naming gate commit.rationale; a departure allows it", async () => {
  const { bash, depart } = setup(offlineJev);
  const blocked = await bash(commit("fix: tiny"));
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /commit\.rationale/);
  assert.match(blocked?.reason ?? "", /devsys_record_departure/);
  await depart("commit.rationale");
  assert.equal(await bash(commit("fix: tiny")), undefined);
});

test("a non-conventional subject is blocked under commit.rationale", async () => {
  const { bash } = setup(offlineJev);
  const blocked = await bash(commit(`update stuff\n\n${BODY}`));
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /Conventional/);
});

test("Jev reading a body as no rationale blocks it under commit.rationale", async () => {
  const { bash } = setup(jevJudging(0.1, 0.1));
  const blocked = await bash(commit(GOOD));
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /commit\.rationale/);
});

test("Jev mix >= 0.7 blocks under commit.mixed-change; below allows", async () => {
  const mixed = setup(jevJudging(0.9, 0.8));
  const blocked = await mixed.bash(commit(GOOD));
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /commit\.mixed-change/);
  await mixed.depart("commit.mixed-change");
  assert.equal(await mixed.bash(commit(GOOD)), undefined);
  const clean = setup(jevJudging(0.9, 0.69));
  assert.equal(await clean.bash(commit(GOOD)), undefined);
});

test("Jev offline skips the Jev checks but keeps the deterministic ones", async () => {
  const { bash } = setup(offlineJev);
  assert.equal(await bash(commit(GOOD)), undefined);
  assert.equal((await bash(commit("fix: tiny")))?.block, true);
});

test("an empty diff skips Jev", async () => {
  let asked = 0;
  const counting: Jev = {
    ...offlineJev,
    ask: async () => {
      asked++;
      return err({ kind: "no-model" });
    },
  };
  const { bash } = setup(counting, "");
  assert.equal(await bash(commit(GOOD)), undefined);
  assert.equal(asked, 0);
});

test("-F reads the message file; an unreadable or unknown message is not blocked", async () => {
  const { bash, cwd } = setup(offlineJev);
  writeFileSync(join(cwd, "msg.txt"), "fix: tiny");
  assert.equal((await bash("git commit -F msg.txt"))?.block, true);
  assert.equal(await bash("git commit -F missing.txt"), undefined);
  assert.equal(await bash("git commit"), undefined);
});

test("a once-scoped departure is spent by one commit", async () => {
  const { fake, bash, state } = setup(offlineJev);
  const record = createRecordDepartureTool({ pi: fake.api, state, now });
  await record.execute(
    "once-1",
    { gate: "commit.rationale", chosen: "x", why: "y", costIfWrong: "z", scope: "once" } as never,
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(await bash(commit("fix: tiny")), undefined);
  assert.equal((await bash(commit("fix: tiny")))?.block, true);
});
