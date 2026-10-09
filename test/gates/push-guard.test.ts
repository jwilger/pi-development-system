import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import type { Exec } from "../../src/core/exec.ts";
import { err, ok } from "../../src/core/result.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { createExcusedMessages, type ExcusedMessages } from "../../src/gates/excused-messages.ts";
import { registerPushGuard } from "../../src/gates/push-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");

const offlineJev: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};
const jevRelated = (probability: number): Jev => ({
  ask: async () =>
    ok({ related: { type: "bool", probability } } satisfies Record<string, ClassifierAnswer>),
  availability: () => "online",
  model: () => "fake/jev",
});

type World = {
  mode?: string;
  ci?: "success" | "failure" | "in_progress";
  branch?: string;
  lastCommit?: string;
  hasUI?: boolean;
  jev?: Jev;
  noFailureLog?: boolean;
  /** Messages of the commits no remote has yet; a message may be prefixed `merge:` for a merge commit. */
  unpushed?: string[];
  /** `git log` for the unpushed commits fails, as it does with no remote. */
  logFails?: boolean;
  /** No remote-tracking branch exists yet (a first push, a fresh fork). */
  noRemoteRefs?: boolean;
  excused?: ExcusedMessages;
  /** Unpushed messages by the ref being logged (`HEAD`, a branch); falls back to `unpushed`. */
  unpushedBy?: Record<string, string[]>;
};

type LogCall = { ref: string; cwd: string | undefined };

const unpushedLog = (world: World, ref: string) => {
  if (world.logFails) return { code: 128, stdout: "", stderr: "fatal" };
  const records = (world.unpushedBy?.[ref] ?? world.unpushed ?? []).map((m) =>
    m.startsWith("merge:") ? `p1 p2\u001f${m.slice(6)}\n\u0000` : `p1\u001f${m}\n\u0000`,
  );
  return { code: 0, stdout: records.join(""), stderr: "" };
};

const ghRun = (world: World, line: string) => {
  const out = (stdout: string) => ({ code: 0, stdout, stderr: "" });
  if (line.startsWith("gh run view")) {
    return world.noFailureLog
      ? { code: 1, stdout: "", stderr: "no log" }
      : out("FAIL src/a.test.ts: expected 1 got 2");
  }
  const ci = world.ci ?? "success";
  const running = ci === "in_progress";
  return out(
    JSON.stringify([
      {
        status: running ? "in_progress" : "completed",
        conclusion: running ? "" : ci,
        headSha: "abcdef1234",
        databaseId: 99,
      },
    ]),
  );
};

const remoteRefs = (world: World) => ({
  code: 0,
  stdout: world.noRemoteRefs ? "" : "abc refs/remotes/origin/main\n",
  stderr: "",
});

const setup = (world: World = {}) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-push-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version = 1\n\n[delivery]\nmode = "${world.mode ?? "trunk"}"\n`,
  );
  const fake = createFakePi({ hasUI: world.hasUI ?? false, cwd });
  const state = createSessionState(fake.api);
  const approvals = createApprovalStore(fake.api);
  const logCalls: LogCall[] = [];
  const exec: Exec = async (command, args, options) => {
    // Node refuses to start a process whose arguments hold a NUL byte; so does this fake.
    if (args.some((a) => a.includes("\u0000"))) throw new Error("argument contains a NUL byte");
    const line = [command, ...args].join(" ");
    const out = (stdout: string) => ({ code: 0, stdout, stderr: "" });
    if (line.startsWith("gh run")) return ghRun(world, line);
    if (line.startsWith("git rev-parse")) return out(`${world.branch ?? "main"}\n`);
    if (line.startsWith("git for-each-ref")) return remoteRefs(world);
    if (line.includes("--not --remotes")) {
      logCalls.push({ ref: args[1] ?? "", cwd: options?.cwd });
      return unpushedLog(world, args[1] ?? "");
    }
    if (line.startsWith("git log")) return out(`${world.lastCommit ?? "feat: add a thing"}\n`);
    if (line.startsWith("git diff")) return out("diff --git a/src/a.ts b/src/a.ts\n-1\n+2\n");
    return out("");
  };
  registerPushGuard({
    pi: fake.api,
    state,
    approvals,
    jev: () => world.jev ?? offlineJev,
    exec,
    now,
    excused: world.excused,
  });
  const push = (command: string) =>
    fake.emit({
      type: "tool_call",
      toolName: "bash",
      toolCallId: "c1",
      input: { command },
    } as never) as Promise<{ block: boolean; reason: string } | undefined>;
  return { fake, state, push, cwd, logCalls };
};

test("non-push commands are ignored", async () => {
  const { push } = setup({ ci: "failure" });
  assert.equal(await push("git status"), undefined);
});

test("a push wrapped in timeout or sudo is judged like a bare push", async () => {
  const w = setup({ mode: "local-only" });
  for (const command of [
    'timeout 300 bash -c "git push origin main"',
    "sudo -E bash -c 'git push origin main'",
  ]) {
    assert.equal((await w.push(command))?.block, true, command);
  }
});

test("a push on a green trunk is allowed", async () => {
  const { push } = setup();
  assert.equal(await push("git push origin main"), undefined);
});

test("pending or unknown CI does not block", async () => {
  const { push } = setup({ ci: "in_progress" });
  assert.equal(await push("git push origin main"), undefined);
});

test("local-only blocks every push with a reason naming the setting", async () => {
  const { push } = setup({ mode: "local-only" });
  const r = await push("git push origin feature");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /local-only/);
});

test("pull-request mode hard-stops a push to the trunk but not to a branch", async () => {
  const { push } = setup({ mode: "pull-request" });
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /hard stop push\.delivery-mode/);
  assert.equal(await push("git push origin feature/x"), undefined);
});

test("a bare push resolves the current branch", async () => {
  const onTrunk = setup({ mode: "pull-request", branch: "main" });
  assert.equal((await onTrunk.push("git push"))?.block, true);
  const onFeature = setup({ mode: "pull-request", branch: "feature/x" });
  assert.equal(await onFeature.push("git push"), undefined);
});

test("a red trunk hard-stops an unrelated push", async () => {
  const { push } = setup({ ci: "failure", jev: jevRelated(0.1) });
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /hard stop push\.red-trunk/);
  assert.match(r?.reason ?? "", /Requires user approval/);
});

test("a fix commit Jev reads as related to the failure may push to a red trunk", async () => {
  const { push } = setup({
    ci: "failure",
    lastCommit: "fix(ci): repair the failing test",
    jev: jevRelated(0.9),
  });
  assert.equal(await push("git push origin main"), undefined);
});

test("a fix commit Jev reads as unrelated is still hard-stopped", async () => {
  const { push } = setup({
    ci: "failure",
    lastCommit: "fix: tweak something else",
    jev: jevRelated(0.3),
  });
  assert.equal((await push("git push origin main"))?.block, true);
});

test("a non-fix commit never gets the red-trunk exemption, even if Jev says related", async () => {
  const { push } = setup({ ci: "failure", lastCommit: "feat: shiny", jev: jevRelated(0.95) });
  assert.equal((await push("git push origin main"))?.block, true);
});

test("Jev offline means a red trunk push is hard-stopped", async () => {
  const { push } = setup({ ci: "failure", lastCommit: "fix: x" });
  assert.equal((await push("git push origin main"))?.block, true);
});

test("an approving user can push on a red trunk and the approval is one-shot", async () => {
  const { fake, push } = setup({ ci: "failure", hasUI: true });
  fake.ui.confirmResponses.push(true);
  assert.equal(await push("git push origin main"), undefined);
  fake.ui.confirmResponses.push(false);
  assert.equal((await push("git push origin main"))?.block, true);
});

test("a broken config blocks pushes with the parse message", async () => {
  const { push, cwd } = setup();
  writeFileSync(join(cwd, ".development-system.toml"), "version = 1\n[delivery]\nmode = 3\n");
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /delivery policy/);
});

test("a successful push records lastPushAt; a failed push or a non-push does not", async () => {
  const { fake, state } = setup();
  const result = (command: string, isError: boolean) =>
    fake.emit({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "c2",
      input: { command },
      content: [],
      isError,
      details: undefined,
    } as never);
  await result("git push origin main", true);
  await result("git status", false);
  assert.equal(state.get().lastPushAt, undefined);
  await result("git push origin main", false);
  assert.equal(state.get().lastPushAt, "2026-10-06T17:12:00.000Z");
});

test("a fix commit is not exempt when there is no failure log to compare against", async () => {
  const w = setup({
    ci: "failure",
    lastCommit: "fix(ci): repair",
    jev: jevRelated(0.95),
    noFailureLog: true,
  });
  const result = await w.push("git push origin main");
  assert.equal(result?.block, true);
});

test("a push whose directory cannot be resolved is treated as a trunk push in pull-request mode", async () => {
  const w = setup({ mode: "pull-request" });
  const result = await w.push("cd ~/nowhere && git push");
  assert.equal(result?.block, true);
});

test("dry runs and tag-only pushes are not trunk pushes in pull-request mode", async () => {
  const w = setup({ mode: "pull-request" });
  assert.equal(await w.push("git push --dry-run origin main"), undefined);
  assert.equal(await w.push("git push --tags"), undefined);
  assert.equal((await w.push("git push origin HEAD feat"))?.block, true);
});

test("a push with a redirect and no refspec still checks the current branch", async () => {
  const w = setup({ mode: "pull-request" });
  assert.equal((await w.push("git push 2>&1"))?.block, true);
  assert.equal((await w.push("git push >/dev/null 2>&1"))?.block, true);
});

test("on a red trunk a call that commits and pushes together is refused, not judged on the old HEAD", async () => {
  const { push } = setup({ ci: "failure", lastCommit: "fix: old", jev: jevRelated(0.95) });
  const r = await push(
    'git add -A && git commit -m "feat: huge unrelated" -m "because reasons here" && git push origin main',
  );
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /Commit first in one call, then push/);
});

const EXPLAINED =
  "fix: stop retrying on 401\n\nThe client retried forever because the 401 was treated as transient, so a revoked token hammered the API until the process died.\n";
const ATTRIBUTED = `${EXPLAINED}\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;

test("an unpushed commit that carries an AI trailer blocks the push, whatever made the commit", async () => {
  for (const mode of ["trunk", "pull-request"]) {
    const { push } = setup({ mode, unpushed: [EXPLAINED, ATTRIBUTED] });
    const r = await push("git push origin feature/x");
    assert.equal(r?.block, true, mode);
    assert.match(r?.reason ?? "", /commit\.forbidden-trailer/);
    assert.match(r?.reason ?? "", /Co-Authored-By/i);
  }
});

test("an unpushed commit with no rationale body needs a commit.rationale departure to push", async () => {
  const { push, state } = setup({ unpushed: ["chore: tidy\n"] });
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /commit\.rationale/);
  assert.match(r?.reason ?? "", /devsys_record_departure/);
  state.update((s) => ({
    ...s,
    openDepartures: [
      {
        id: "d1",
        gate: "commit.rationale" as never,
        chosen: "x",
        why: "y",
        costIfWrong: "z",
        scope: { kind: "once" },
        at: "2026-01-01T00:00:00.000Z",
      } as never,
    ],
  }));
  assert.equal(await push("git push origin main"), undefined);
  assert.equal(state.get().openDepartures.length, 0, "a once departure is spent");
});

test("commits with a rationale, a merge commit and an empty range let the push through", async () => {
  assert.equal(
    await setup({ unpushed: [EXPLAINED, "merge:Merge branch 'a' into main\n"] }).push(
      "git push origin main",
    ),
    undefined,
  );
  assert.equal(await setup({ unpushed: [] }).push("git push origin main"), undefined);
});

test("a merge commit with an AI trailer is still refused", async () => {
  const { push } = setup({ unpushed: ["merge:Merge x\n\nCo-authored-by: GPT <a@b.c>\n"] });
  assert.match((await push("git push origin main"))?.reason ?? "", /forbidden-trailer/);
});

test("when git cannot list the unpushed commits the push is left to git", async () => {
  const { push } = setup({ logFails: true });
  assert.equal(await push("git push origin main"), undefined);
});

test("a tags-only push checks the commits its tags point at", async () => {
  const { push, logCalls } = setup({ unpushed: [ATTRIBUTED] });
  const r = await push("git push origin --tags");
  assert.match(r?.reason ?? "", /forbidden-trailer/);
  assert.deepEqual(
    logCalls.map((c) => c.ref),
    ["--tags"],
  );
});

test("a branch pushed with --tags checks the branch and every tag", async () => {
  const { push, logCalls } = setup({ unpushed: [ATTRIBUTED] });
  const r = await push("git push origin main --tags");
  assert.match(r?.reason ?? "", /forbidden-trailer/);
  assert.deepEqual(
    logCalls.map((c) => c.ref),
    ["main", "--tags"],
  );
});

test("pushes that may send any branch check every branch", async () => {
  for (const command of [
    "git push --all origin",
    "git push origin :",
    'git push origin "$SHA":refs/heads/x',
  ]) {
    const { push, logCalls } = setup({ unpushed: [ATTRIBUTED] });
    const r = await push(command);
    assert.match(r?.reason ?? "", /forbidden-trailer/, command);
    assert.deepEqual(
      logCalls.map((c) => c.ref),
      ["--branches"],
      command,
    );
  }
});

test("the commits checked are those of the pushed branch, not whatever HEAD is", async () => {
  const { push, logCalls } = setup({
    branch: "main",
    unpushedBy: { HEAD: [EXPLAINED], "feature/x": [ATTRIBUTED] },
  });
  const r = await push("git push origin feature/x");
  assert.match(r?.reason ?? "", /forbidden-trailer/);
  assert.deepEqual(
    logCalls.map((c) => c.ref),
    ["feature/x"],
  );
});

test("a push through git -C checks the repository it runs in", async () => {
  const { push, logCalls, cwd } = setup({ unpushed: [EXPLAINED] });
  await push("git -C ../other push origin main");
  assert.equal(logCalls[0]?.cwd, join(cwd, "..", "other"));
});

test("a first push, with no remote-tracking branch, still refuses an AI trailer", async () => {
  const { push } = setup({ noRemoteRefs: true, unpushed: [ATTRIBUTED] });
  const r = await push("git push origin main");
  assert.match(r?.reason ?? "", /forbidden-trailer/);
});

test("a first push does not demand a rationale of commits it cannot tell apart from old history", async () => {
  const { push } = setup({ noRemoteRefs: true, unpushed: ["chore: tidy\n"] });
  assert.equal(await push("git push origin main"), undefined);
});

test("a rationale departure is not spent by a push another stop refuses", async () => {
  const { push, state } = setup({
    mode: "pull-request",
    unpushed: ["chore: tidy\n"],
  });
  state.update((s) => ({
    ...s,
    openDepartures: [
      {
        id: "d1",
        gate: "commit.rationale" as never,
        chosen: "x",
        why: "y",
        costIfWrong: "z",
        scope: { kind: "once" },
        at: "2026-01-01T00:00:00.000Z",
      } as never,
    ],
  }));
  const r = await push("git push origin main");
  assert.match(r?.reason ?? "", /hard stop push\.delivery-mode/);
  assert.equal(state.get().openDepartures.length, 1, "still open for the retry");
});

test("HEAD:feature pushes HEAD, so the commits checked are HEAD's", async () => {
  const { push, logCalls } = setup({ unpushedBy: { HEAD: [ATTRIBUTED] } });
  const r = await push("git push origin HEAD:feature/x");
  assert.match(r?.reason ?? "", /forbidden-trailer/);
  assert.deepEqual(
    logCalls.map((c) => c.ref),
    ["HEAD"],
  );
});

test("a missing rationale is refused before any approval is asked for", async () => {
  const { push, fake } = setup({ mode: "pull-request", hasUI: true, unpushed: ["chore: tidy\n"] });
  const r = await push("git push origin main");
  assert.match(r?.reason ?? "", /commit\.rationale/);
  assert.deepEqual(fake.ui.calls, []);
});

test("a message the commit guard already excused is not asked about again at push", async () => {
  const excused = createExcusedMessages();
  excused.add("chore: tidy");
  assert.equal(
    await setup({ unpushed: ["chore: tidy\n"], excused }).push("git push origin main"),
    undefined,
  );
  const other = await setup({ unpushed: ["chore: other\n"], excused }).push("git push origin main");
  assert.match(other?.reason ?? "", /commit\.rationale/);
});

test("a push that only deletes refs publishes no commit to judge", async () => {
  for (const command of ["git push origin --delete old", "git push origin :old"]) {
    const { push, logCalls } = setup({ unpushed: [ATTRIBUTED] });
    assert.equal(await push(command), undefined, command);
    assert.deepEqual(logCalls, [], command);
  }
});

test("an option-shaped refspec is never handed to git log", async () => {
  const { push, logCalls } = setup({ unpushed: [EXPLAINED] });
  await push("git push origin +--output=/tmp/x");
  assert.equal(
    logCalls.some((c) => c.ref.startsWith("-")),
    false,
  );
});

test("a push in the same call as commits the commit guard cannot read is refused", async () => {
  for (const command of [
    "git cherry-pick abc && git push origin main",
    "git commit -C HEAD~1 && git push origin main",
    "git commit-tree T -m x && git push origin main",
    "git commit -F - < /tmp/msg && git push origin feature",
    "git commit -F ~/msg.txt && git push origin feature",
    "printf 'feat: x\\n\\nCo-Authored-By: A <a@b.c>' > /tmp/m && git commit -F /tmp/m && git push origin main",
    "git commit -m 'feat: x' --trailer \"$(echo Co-Authored-By: A)\" && git push origin main",
    "git -c alias.ci=commit ci -m 'feat: x' -m 'Co-Authored-By: A <a@b.c>' && git push origin feature",
  ]) {
    const r = await setup().push(command);
    assert.equal(r?.block, true, command);
    assert.match(r?.reason ?? "", /separate|next call|in the next/, command);
  }
  const literal =
    "git commit -m \"$(cat <<'EOF'\nfix: handle `null` and $HOME\n\nbecause y z w q r s\nEOF\n)\" && git push origin main";
  assert.equal(await setup().push(literal), undefined);
  assert.equal(
    await setup().push(
      "git commit -m 'fix: handle `null` and $HOME' -m 'because y z w q r s' && git push origin main",
    ),
    undefined,
  );
  assert.equal(
    await setup().push(
      'git commit -m "fix: handle \\`null\\` input" -m "because y z w q r s" && git push origin main',
    ),
    undefined,
  );
  for (const maker of [
    "git merge feature",
    "git revert abc",
    "git am p.patch",
    "git cherry-pick -x abc",
  ]) {
    const r = await setup().push(`${maker} && git push origin main`);
    assert.equal(r?.block, true, maker);
  }
  assert.equal(await setup().push("git push origin feature/merge-queue"), undefined);
  for (const stop of [
    "git merge --ff-only feature",
    "git merge --abort",
    "git merge --squash feature",
    "git merge --no-commit feature",
    "git cherry-pick --abort",
    "git cherry-pick -n abc",
    "git revert -n abc",
    "git am --quit",
  ])
    assert.equal(await setup().push(`${stop} && git push origin main`), undefined, stop);
  assert.equal(await setup().push("git st"), undefined);
  assert.equal(await setup().push("git push -u origin revert-bad-retry"), undefined);
  assert.equal(
    await setup().push("git commit -m 'feat: x' -m 'because y z w q r s' && git push origin main"),
    undefined,
  );
});
