import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import { addRound, startReview } from "../../src/core/review.ts";
import { upsertReview } from "../../src/core/review-flow.ts";
import type { SliceRef } from "../../src/core/types.ts";
import { registerCommitGuard } from "../../src/gates/commit-guard.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import type { Jev } from "../../src/jev/client.ts";
import { digestOf } from "../../src/review/digest.ts";
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

test("-F reads the message file; an unreadable one cannot be checked and is blocked", async () => {
  const { bash, cwd } = setup(offlineJev);
  writeFileSync(join(cwd, "msg.txt"), "fix: tiny");
  assert.equal((await bash("git commit -F msg.txt"))?.block, true);
  assert.equal((await bash("git commit -F missing.txt"))?.block, true);
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

test("AI trailers hidden in --trailer=, amends, heredoc-written files and wrappers are blocked", async () => {
  const { bash } = setup(offlineJev);
  for (const c of [
    `git commit -m 'fix: a thing' --trailer 'Co-Authored-By=Claude <c@x.y>'`,
    "git commit --amend --no-edit --trailer 'Co-Authored-By: Claude'",
    "cat > /tmp/m <<'EOF'\nfix: x\n\nbody here is long enough\n\nCo-Authored-By: Claude <c@x.y>\nEOF\ngit commit -F /tmp/m",
    `bash -c "git commit -m 'fix: x' --trailer 'Co-Authored-By: Claude'"`,
  ]) {
    assert.equal((await bash(c))?.block, true, c);
  }
});

test("a Signed-off-by AI trailer piped through stdin is blocked", async () => {
  const { bash } = setup(offlineJev);
  const result = await bash(
    "cat <<'EOF' | git commit -F -\nfeat: x\n\nwhy because things\n\nSigned-off-by: Claude <n@a.com>\nEOF",
  );
  assert.equal(result?.block, true);
});

test("the Jev diff is the staged one, or the whole tree when the command stages as it commits", async () => {
  const diffArgs = async (command: string): Promise<string[]> => {
    const { bash, execCalls } = setup(jevJudging(0.9, 0.1));
    await bash(command);
    return execCalls.find((c) => c[1] === "diff" && !c.includes("--stat")) ?? [];
  };
  assert.deepEqual(await diffArgs(commit(GOOD)), ["git", "diff", "--cached"]);
  assert.deepEqual(await diffArgs(`git add src/a.ts && ${commit(GOOD)}`), ["git", "diff", "HEAD"]);
  assert.deepEqual(await diffArgs(`git add -A; ${commit(GOOD)}`), ["git", "diff", "HEAD"]);
  assert.deepEqual(await diffArgs(`git commit -a -m '${GOOD}'`), ["git", "diff", "HEAD"]);
});

test("a message built by a substitution cannot be checked, so it needs a departure", async () => {
  const { bash } = setup(offlineJev);
  for (const c of [
    'git commit -m "fix: x" -m "$(cat /tmp/msg.txt)"',
    'git commit -m "wip" -m "$BODY"',
    'git commit -m "$MSG"',
  ]) {
    const result = await bash(c);
    assert.equal(result?.block, true, c);
    assert.match(result?.reason ?? "", /commit\.rationale/, c);
  }
});

test("commits that legitimately have no inline message are not blocked as opaque", async () => {
  const { bash } = setup(offlineJev);
  for (const c of [
    "git commit --amend --no-edit",
    "git commit -C HEAD",
    "git commit --fixup HEAD",
  ]) {
    const result = await bash(c);
    assert.equal(result?.reason?.includes("substitution"), undefined, c);
  }
});

// --- review.unsatisfied (I6.4) ---
const DIFF = "a.ts | 2 +-";
const withPhase = (t: ReturnType<typeof setup>, phase: "implementing" | "reviewing" | "idle") =>
  t.state.update((s) => ({ ...s, phase, activeSlice: "s1" as SliceRef }));
const cleanRounds = (n: number, digest = digestOf(DIFF)) =>
  Array.from({ length: n }).reduce<ReturnType<typeof startReview>>(
    (r) => addRound(r, { lenses: ["types"], findings: [], reviewedAt: "t", diffDigest: digest }),
    startReview("s1" as SliceRef, 3),
  );

test("while implementing, a commit with no review for the slice needs a departure", async () => {
  const t = setup(jevJudging(0.9, 0.1));
  withPhase(t, "implementing");
  const r = await t.bash(commit(GOOD));
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /review\.unsatisfied/);
  assert.match(r?.reason ?? "", /devsys_review_start/);
});

test("a recorded review.unsatisfied departure lets the commit through", async () => {
  const t = setup(jevJudging(0.9, 0.1));
  withPhase(t, "reviewing");
  await t.depart("review.unsatisfied");
  assert.equal(await t.bash(commit(GOOD)), undefined);
});

test("a satisfied review on the current diff passes; a stale or partial one blocks", async () => {
  const t = setup(jevJudging(0.9, 0.1));
  withPhase(t, "implementing");
  t.state.update((s) => upsertReview(s, cleanRounds(3)));
  assert.equal(await t.bash(commit(GOOD)), undefined);
  t.state.update((s) => upsertReview(s, cleanRounds(3, "other")));
  assert.match((await t.bash(commit(GOOD)))?.reason ?? "", /changed since/);
  t.state.update((s) => upsertReview(s, cleanRounds(1)));
  assert.match((await t.bash(commit(GOOD)))?.reason ?? "", /1\/3/);
});

test("outside implementing and reviewing, or without an active slice, the review gate is silent", async () => {
  const idle = setup(jevJudging(0.9, 0.1));
  withPhase(idle, "idle");
  assert.equal(await idle.bash(commit(GOOD)), undefined);
  const noSlice = setup(jevJudging(0.9, 0.1));
  noSlice.state.update((s) => ({ ...s, phase: "implementing" }));
  assert.equal(await noSlice.bash(commit(GOOD)), undefined);
});
