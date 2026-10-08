import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import { addRound, startReview } from "../../src/core/review.ts";
import { splitDiffByFile, upsertReview } from "../../src/core/review-flow.ts";
import type { SliceRef } from "../../src/core/types.ts";
import { registerCommitGuard } from "../../src/gates/commit-guard.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import type { Jev } from "../../src/jev/client.ts";
import { digestOf, snapshotDiff } from "../../src/review/digest.ts";
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

const jevArchitectural = (architecture: number): Jev => ({
  ask: async () =>
    ok({
      rationale: { type: "bool", probability: 0.9 },
      mix: { type: "bool", probability: 0.1 },
      architecture: { type: "bool", probability: architecture },
    } satisfies Record<string, ClassifierAnswer>),
  availability: () => "online",
  model: () => "fake/jev",
});

const DIFF = "diff --git a/a.ts b/a.ts\n+1\n";
const sectionA = new Map(Object.entries(splitDiffByFile(DIFF))).get("a.ts") ?? "";
type Names = { staged?: string; unstaged?: string; fail?: boolean; untracked?: string };
const setup = (jev: Jev, diff = "a.ts | 2 +-", names: Names = {}) => {
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
      const nameList = args.includes("--cached") ? names.staged : names.unstaged;
      let stdout = diff;
      if (args.includes("ls-files")) {
        // Honour the pathspecs after `--` the way git does: a file, or a directory prefix.
        const specs = args.slice(args.indexOf("--") + 1);
        stdout = (names.untracked ?? "")
          .split("\n")
          .filter(
            (f) => f !== "" && specs.some((sp) => sp === "." || f === sp || f.startsWith(`${sp}/`)),
          )
          .map((f) => `${f}\n`)
          .join("");
      } else if (args.includes("--name-only")) stdout = nameList ?? "";
      const failed = names.fail === true && args.includes("--name-only");
      return { code: failed ? 1 : 0, stdout, stderr: "" };
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
  const fixed = ["--no-ext-diff", "--no-color", "--src-prefix=a/", "--dst-prefix=b/"];
  assert.deepEqual(await diffArgs(commit(GOOD)), ["git", "diff", ...fixed, "--cached"]);
  assert.deepEqual(await diffArgs(`git add src/a.ts && ${commit(GOOD)}`), [
    "git",
    "diff",
    ...fixed,
    "HEAD",
  ]);
  assert.deepEqual(await diffArgs(`git add -A; ${commit(GOOD)}`), [
    "git",
    "diff",
    ...fixed,
    "HEAD",
  ]);
  assert.deepEqual(await diffArgs(`git commit -a -m '${GOOD}'`), ["git", "diff", ...fixed, "HEAD"]);
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
const withPhase = (t: ReturnType<typeof setup>, phase: "implementing" | "reviewing" | "idle") =>
  t.state.update((s) => ({ ...s, phase, activeSlice: "s1" as SliceRef }));
// The digest the guard will compute: same fake exec as setup(), which answers every git call with DIFF.
const currentDigest = async () => {
  const snap = await snapshotDiff(
    async (_command, args) => ({
      code: 0,
      stdout: args.includes("ls-files") ? "" : DIFF,
      stderr: "",
    }),
    "/",
    "HEAD",
  );
  if (!snap.ok) throw new Error(snap.error);
  return snap.value.digest;
};
const cleanRounds = (n: number, digest: string) =>
  Array.from({ length: n }).reduce<ReturnType<typeof startReview>>(
    (r) => addRound(r, { lenses: ["types"], findings: [], reviewedAt: "t", diffDigest: digest }),
    startReview("s1" as SliceRef, 3),
  );

test("while implementing, a commit with no review for the slice needs a departure", async () => {
  const t = setup(jevJudging(0.9, 0.1), DIFF);
  withPhase(t, "implementing");
  const r = await t.bash(commit(GOOD));
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /review\.unsatisfied/);
  assert.match(r?.reason ?? "", /devsys_review_start/);
});

test("a recorded review.unsatisfied departure lets the commit through", async () => {
  const t = setup(jevJudging(0.9, 0.1), DIFF);
  withPhase(t, "reviewing");
  await t.depart("review.unsatisfied");
  assert.equal(await t.bash(commit(GOOD)), undefined);
});

test("a satisfied review on the current diff passes; a stale or partial one blocks", async () => {
  const t = setup(jevJudging(0.9, 0.1), DIFF);
  withPhase(t, "implementing");
  const digest = await currentDigest();
  t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
  assert.equal(await t.bash(commit(GOOD)), undefined);
  t.state.update((s) => upsertReview(s, cleanRounds(3, "other")));
  assert.match((await t.bash(commit(GOOD)))?.reason ?? "", /changed since/);
  t.state.update((s) => upsertReview(s, cleanRounds(1, digest)));
  assert.match((await t.bash(commit(GOOD)))?.reason ?? "", /1\/3/);
});

test("outside implementing and reviewing, or without an active slice, the review gate is silent", async () => {
  const idle = setup(jevJudging(0.9, 0.1), DIFF);
  withPhase(idle, "idle");
  assert.equal(await idle.bash(commit(GOOD)), undefined);
  const noSlice = setup(jevJudging(0.9, 0.1), DIFF);
  noSlice.state.update((s) => ({ ...s, phase: "implementing" }));
  assert.equal(await noSlice.bash(commit(GOOD)), undefined);
});

test("committing a reviewed change in parts passes: the rest is only reviewed files", async () => {
  const t = setup(jevJudging(0.9, 0.1), DIFF);
  withPhase(t, "implementing");
  // Reviewed: two files. Now only one of them remains in the diff (the other was committed).
  const reviewed = Array.from({ length: 3 }).reduce<ReturnType<typeof startReview>>(
    (r) =>
      addRound(r, {
        lenses: ["types"],
        findings: [],
        reviewedAt: "t",
        diffDigest: "earlier",
        files: { "a.ts": digestOf(sectionA), "gone.ts": "x" },
      }),
    startReview("s1" as SliceRef, 3),
  );
  t.state.update((s) => upsertReview(s, reviewed));
  assert.equal(await t.bash(commit(GOOD)), undefined);
});

test("a staged file edited again after review commits unreviewed content, so the gate asks", async () => {
  const digest = await currentDigest();
  const t = setup(jevJudging(0.9, 0.1), DIFF, { staged: "a.ts\0b.ts\0", unstaged: "a.ts\0" });
  withPhase(t, "implementing");
  t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
  const r = await t.bash(commit(GOOD));
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /review\.unsatisfied/);
  assert.match(r?.reason ?? "", /staged.*a\.ts.*work tree/s);
});

test("staging everything in the same command, or edits to files that are not staged, do not trip it", async () => {
  const digest = await currentDigest();
  const partial = setup(jevJudging(0.9, 0.1), DIFF, { staged: "b.ts\0", unstaged: "a.ts\0" });
  withPhase(partial, "implementing");
  partial.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
  assert.equal(await partial.bash(commit(GOOD)), undefined);
  const all = setup(jevJudging(0.9, 0.1), DIFF, { staged: "a.ts\0", unstaged: "a.ts\0" });
  withPhase(all, "implementing");
  all.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
  assert.equal(await all.bash(`git add -A && ${commit(GOOD)}`), undefined);
});

test("only a command that re-stages everything skips the staged-then-edited check", async () => {
  const digest = await currentDigest();
  const run = async (command: string, names: Names = { staged: "a.ts\0", unstaged: "a.ts\0" }) => {
    const t = setup(jevJudging(0.9, 0.1), DIFF, names);
    withPhase(t, "implementing");
    t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
    return t.bash(command);
  };
  // `git add other` and a message that merely contains " -a…" do not re-stage a.ts.
  assert.equal((await run(`git add b.ts && ${commit(GOOD)}`))?.block, true);
  assert.equal(
    (await run(`git commit -m 'perf(x): run -parallel jobs because it is faster'`))?.block,
    true,
  );
  // These really do take the work tree.
  assert.equal(await run(`git add -A && ${commit(GOOD)}`), undefined);
  assert.equal(await run(`git add . && ${commit(GOOD)}`), undefined);
  assert.equal(await run(`git add -u && ${commit(GOOD)}`), undefined);
  assert.equal(await run(`git commit -a -m '${GOOD}'`), undefined);
  assert.equal(await run(`git commit --all -m '${GOOD}'`), undefined);
  // A path named in the command is committed from the work tree.
  assert.equal(await run(`git commit -m '${GOOD}' a.ts`), undefined);
});

test("a dirty submodule does not count as an edit after staging", async () => {
  const t = setup(jevJudging(0.9, 0.1), DIFF);
  withPhase(t, "implementing");
  const digest = await currentDigest();
  t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
  await t.bash(commit(GOOD));
  assert.ok(
    t.execCalls.some((c) => c.includes("--name-only") && c.includes("--ignore-submodules=dirty")),
  );
});

test("the re-stage exemption needs a whole-repo add ahead of the commit, in this directory", async () => {
  const digest = await currentDigest();
  const blocked = async (command: string, names?: Names) => {
    const t = setup(jevJudging(0.9, 0.1), DIFF, names ?? { staged: "a.ts\0", unstaged: "a.ts\0" });
    withPhase(t, "implementing");
    t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
    return (await t.bash(command))?.block === true;
  };
  assert.equal(
    await blocked(`git commit -m 'docs: update a.ts notes'`),
    true,
    "name inside a message",
  );
  assert.equal(await blocked(`git add -A src/ && ${commit(GOOD)}`), true, "pathspec");
  assert.equal(await blocked(`cd sub && git add . && ${commit(GOOD)}`), true, "other directory");
  assert.equal(await blocked(`git -C ../other add -A && ${commit(GOOD)}`), true, "other repo");
  assert.equal(await blocked(`${commit(GOOD)} && git add -A`), true, "add after the commit");
  assert.equal(await blocked(`git commit --include x -m '${GOOD}'`), true, "--include needs paths");
  assert.equal(await blocked(`git commit -uall -m '${GOOD}'`), true, "-uall is not -a");
  assert.equal(await blocked(`git commit -mtab -m '${GOOD}'`), true, "-mtab is a message");
  assert.equal(await blocked(`git commit -sa -m '${GOOD}'`), false, "-sa includes -a");
  assert.equal(await blocked(commit(GOOD), { fail: true }), true, "unreadable names");
});

test("only what runs before the first commit can exempt it, and re-staging in this directory counts", async () => {
  const digest = await currentDigest();
  const blocked = async (
    command: string,
    names: Names = { staged: "src/a.ts\0", unstaged: "src/a.ts\0" },
  ) => {
    const t = setup(jevJudging(0.9, 0.1), DIFF, names);
    withPhase(t, "implementing");
    t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
    return (await t.bash(command.replace("CWD", t.cwd)))?.block === true;
  };
  const c = commit(GOOD);
  assert.equal(
    await blocked(`git add other.ts && ${c} && git add src/a.ts && ${c}`),
    true,
    "later add",
  );
  assert.equal(await blocked(`${c} && git add src/a.ts`), true, "add after commit");
  assert.equal(await blocked(`${c} && git commit -a -m '${GOOD}'`), true, "later commit -a");
  assert.equal(await blocked(`git add -n src/a.ts && ${c}`), true, "dry run stages nothing");
  assert.equal(await blocked(`git add src/ && ${c}`), false, "directory pathspec covers it");
  assert.equal(await blocked(`git add ./src/a.ts && ${c}`), false, "./ prefix");
  assert.equal(await blocked(`cd CWD && git add -A && ${c}`), false, "cd to the session directory");
  assert.equal(await blocked(`cd CWD && git commit -a -m '${GOOD}'`), false, "cd then commit -a");
  assert.equal(await blocked(`cd elsewhere && git add -A && ${c}`), true, "another directory");
});

test("recording a departure after review does not make the review stale", async () => {
  const log = "diff --git a/docs/decisions/2026-10.md b/docs/decisions/2026-10.md\n+## departure\n";
  const t = setup(jevJudging(0.9, 0.1), DIFF + log);
  withPhase(t, "implementing");
  const reviewed = Array.from({ length: 3 }).reduce<ReturnType<typeof startReview>>(
    (r) =>
      addRound(r, {
        lenses: ["types"],
        findings: [],
        reviewedAt: "t",
        diffDigest: "earlier",
        files: { "a.ts": digestOf(sectionA) },
      }),
    startReview("s1" as SliceRef, 3),
  );
  t.state.update((s) => upsertReview(s, reviewed));
  assert.equal(await t.bash(commit(GOOD)), undefined);
});

test("a departure written to a staged decision log is not an edit after review", async () => {
  const digest = await currentDigest();
  const t = setup(jevJudging(0.9, 0.1), DIFF, {
    staged: "a.ts\0docs/decisions/2026-10.md\0",
    unstaged: "docs/decisions/2026-10.md\0",
  });
  withPhase(t, "implementing");
  t.state.update((s) => upsertReview(s, cleanRounds(3, digest)));
  assert.equal(await t.bash(commit(GOOD)), undefined);
});

const ADR_DIFF =
  "diff --git a/docs/adr/0005-use-queue.md b/docs/adr/0005-use-queue.md\nnew file mode 100644\n+x\n";
const CODE_DIFF = "diff --git a/src/queue.ts b/src/queue.ts\n+import Redis from 'ioredis';\n";

test("an architecture-shaping diff with no ADR is blocked naming adr.missing and devsys_adr_new", async () => {
  const { bash, depart } = setup(jevArchitectural(0.9), CODE_DIFF);
  const blocked = await bash(commit(GOOD));
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /adr\.missing/);
  assert.match(blocked?.reason ?? "", /devsys_adr_new/);
  await depart("adr.missing");
  assert.equal(await bash(commit(GOOD)), undefined);
});

test("an architecture-shaping diff that adds an ADR passes", async () => {
  const { bash } = setup(jevArchitectural(0.95), ADR_DIFF + CODE_DIFF);
  assert.equal(await bash(commit(GOOD)), undefined);
});

test("a diff Jev reads as below the threshold passes without an ADR", async () => {
  const { bash } = setup(jevArchitectural(0.69), CODE_DIFF);
  assert.equal(await bash(commit(GOOD)), undefined);
});

test("a diff that only edits an existing ADR does not count as adding one", async () => {
  const edit = "diff --git a/docs/adr/0002-x.md b/docs/adr/0002-x.md\nindex 1..2 100644\n+x\n";
  const { bash } = setup(jevArchitectural(0.9), edit + CODE_DIFF);
  assert.match((await bash(commit(GOOD)))?.reason ?? "", /adr\.missing/);
});

test("an ADR created but not yet staged, added by the same command, counts as adding one", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  assert.equal(await bash("git add -A && " + commit(GOOD)), undefined);
});

test("an untracked ADR does not count when the commit stages nothing new", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  assert.match((await bash(commit(GOOD)))?.reason ?? "", /adr\.missing/);
});

test("commit -a does not stage an untracked ADR, so it does not count", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  assert.match(
    (await bash(commit(GOOD).replace("git commit -m", "git commit -a -m")))?.reason ?? "",
    /adr\.missing/,
  );
});

test("adding only an unrelated path does not count an untracked ADR", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  assert.match((await bash("git add src/a.ts && " + commit(GOOD)))?.reason ?? "", /adr\.missing/);
});

test("adding the ADR by path counts it", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  assert.equal(
    await bash("git add docs/adr/0005-use-queue.md src/a.ts && " + commit(GOOD)),
    undefined,
  );
});

test("adding an unrelated docs file does not count an untracked ADR", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  const cmd = "git add docs/decisions/2026-10.md src/a.ts && " + commit(GOOD);
  assert.match((await bash(cmd))?.reason ?? "", /adr\.missing/);
});

test("the pending diff is read with fixed a/ b/ prefixes and no external diff driver", async () => {
  const { bash, execCalls } = setup(jevArchitectural(0.1), CODE_DIFF);
  await bash(commit(GOOD));
  const diffCall = execCalls.find((c) => c.includes("diff") && !c.includes("--stat"));
  for (const flag of ["--no-ext-diff", "--no-color", "--src-prefix=a/", "--dst-prefix=b/"]) {
    assert.ok(diffCall?.includes(flag), flag);
  }
});

test("git add -A with a pathspec does not count an untracked ADR outside it", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0005-use-queue.md\n",
  });
  const cmd = "git add -A src && " + commit(GOOD);
  assert.match((await bash(cmd))?.reason ?? "", /adr\.missing/);
});

test("git add . and git add -A with no path both count an untracked ADR", async () => {
  for (const add of ["git add .", "git add -A", "git add --all", "git add ./docs"]) {
    const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
      untracked: "docs/adr/0005-use-queue.md\n",
    });
    assert.equal(await bash(`${add} && ${commit(GOOD)}`), undefined, add);
  }
});

test("git add -u and a dry run do not stage an untracked ADR, so they do not count it", async () => {
  for (const add of [
    "git add -u .",
    "git add --update docs",
    "git add -n .",
    "git add --dry-run -A",
  ]) {
    const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
      untracked: "docs/adr/0005-use-queue.md\n",
    });
    assert.match((await bash(`${add} && ${commit(GOOD)}`))?.reason ?? "", /adr\.missing/, add);
  }
});

test("staging an existing ADR by path does not count an unrelated untracked draft ADR", async () => {
  const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
    untracked: "docs/adr/0007-draft.md\n",
  });
  const blocked = await bash(`git add docs/adr/0002-x.md src/queue.ts && ${commit(GOOD)}`);
  assert.match(blocked?.reason ?? "", /adr\.missing/);
});

test("a quoted ADR path in git add still counts the untracked ADR", async () => {
  for (const path of [`"docs/adr/0005-use-queue.md"`, `'docs/adr/0005-use-queue.md'`]) {
    const { bash } = setup(jevArchitectural(0.9), CODE_DIFF, {
      untracked: "docs/adr/0005-use-queue.md\n",
    });
    assert.equal(await bash(`git add ${path} src/a.ts && ${commit(GOOD)}`), undefined, path);
  }
});

test("new files that only exist untracked are still judged when the command stages them", async () => {
  const { bash } = setup(jevArchitectural(0.9), "", { untracked: "src/queue/redis.ts\n" });
  const blocked = await bash(`git add -A && ${commit(GOOD)}`);
  assert.match(blocked?.reason ?? "", /adr\.missing/);
});

test("untracked files outside what git add stages are not judged", async () => {
  const { bash } = setup(jevArchitectural(0.9), "", { untracked: "src/queue/redis.ts\n" });
  assert.equal(await bash(`git add docs/notes.md && ${commit(GOOD)}`), undefined);
});

test("Jev is told about untracked new files, ahead of a stat long enough to be clipped", async () => {
  const seen: string[] = [];
  const spy: Jev = {
    ...jevArchitectural(0.9),
    ask: async (state, questions) => {
      seen.push(String((state as Record<string, unknown>).diffStat ?? ""));
      return jevArchitectural(0.9).ask(state, questions);
    },
  };
  const longStat = " a/very/long/path.ts | 2 +-\n".repeat(120);
  const { bash } = setup(spy, longStat, { untracked: "src/queue/redis.ts\n" });
  await bash(`git add -A && ${commit(GOOD)}`);
  assert.ok(seen.length > 0);
  for (const stat of seen)
    assert.ok(stat.slice(0, 200).includes("src/queue/redis.ts"), stat.slice(0, 200));
});
