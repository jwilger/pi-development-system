import assert from "node:assert/strict";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { createGithubTracker } from "../../src/tracker/github.ts";

type Call = { command: string; args: string[] };
type Reply = { code?: number; stdout?: string; stderr?: string };

const fakeExec = (reply: (args: string[]) => Reply) => {
  const calls: Call[] = [];
  const exec: Exec = (command, args) => {
    calls.push({ command, args });
    const r = reply(args);
    return Promise.resolve({ code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" });
  };
  return { exec, calls };
};

const issue = (over: Record<string, unknown> = {}) => ({
  number: 7,
  title: "Trim emails",
  body: "details",
  state: "OPEN",
  labels: [{ name: "bug" }],
  comments: [{ body: "first" }],
  ...over,
});

test("get maps an issue: number to id, OPEN to open, comments to bodies", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  const r = await createGithubTracker({ exec, cwd: "/r", repo: "o/r" }).get("7");
  assert.deepEqual(r, {
    ok: true,
    value: {
      id: "7",
      title: "Trim emails",
      body: "details",
      status: "open",
      labels: ["bug"],
      comments: ["first"],
    },
  });
  assert.deepEqual(calls[0]?.args.slice(0, 3), ["issue", "view", "7"]);
  assert.ok(calls[0]?.args.includes("--repo") && calls[0].args.includes("o/r"));
});

test("a closed issue is done; the in-progress label is the status and is not listed as a label", async () => {
  const closed = fakeExec(() => ({ stdout: JSON.stringify(issue({ state: "CLOSED" })) }));
  const done = await createGithubTracker({ exec: closed.exec, cwd: "/r" }).get("7");
  assert.equal(done.ok && done.value.status, "done");
  const active = fakeExec(() => ({
    stdout: JSON.stringify(issue({ labels: [{ name: "in-progress" }, { name: "bug" }] })),
  }));
  const r = await createGithubTracker({ exec: active.exec, cwd: "/r" }).get("7");
  assert.equal(r.ok && r.value.status, "in-progress");
  assert.deepEqual(r.ok && r.value.labels, ["bug"]);
});

test("an id that is not an issue number is refused without running gh", async () => {
  const { exec, calls } = fakeExec(() => ({}));
  const r = await createGithubTracker({ exec, cwd: "/r" }).get("7; rm -rf /");
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("list asks for open, closed or all issues and returns them mapped", async () => {
  const { exec, calls } = fakeExec(() => ({
    stdout: JSON.stringify([issue(), issue({ number: 8 })]),
  }));
  const t = createGithubTracker({ exec, cwd: "/r" });
  const r = await t.list({ status: "open" });
  assert.equal(r.ok && r.value.length > 0, true);
  assert.deepEqual(r.ok && r.value.map((i) => i.id), ["7", "8"]);
  assert.ok(calls[0]?.args.join(" ").includes("--state open"));
  await t.list({ status: "done" });
  assert.ok(calls[1]?.args.join(" ").includes("--state closed"));
  await t.list({});
  assert.ok(calls[2]?.args.join(" ").includes("--state all"));
});

test("create passes title, body and labels as separate arguments and returns the new issue", async () => {
  const { exec, calls } = fakeExec((given) =>
    given[1] === "create"
      ? { stdout: "https://github.com/o/r/issues/9\n" }
      : { stdout: JSON.stringify(issue({ number: 9, title: "T; touch x" })) },
  );
  const r = await createGithubTracker({ exec, cwd: "/r" }).create({
    title: "T; touch x",
    body: "b",
    labels: ["bug", "auth"],
  });
  assert.equal(r.ok && r.value.id, "9");
  const args = calls[0]?.args ?? [];
  assert.equal(args[args.indexOf("--title") + 1], "T; touch x");
  assert.equal(args.filter((a) => a === "--label").length, 2);
});

const lines = (calls: Call[]) => calls.map((c) => c.args.join(" "));

test("update edits title and body in one gh issue edit, then closes", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "done", title: "New" });
  const seen = lines(calls);
  const edit = seen.findIndex((j) => j.startsWith("issue edit 7") && j.includes("--title New"));
  const close = seen.findIndex((j) => j.startsWith("issue close 7"));
  assert.ok(edit >= 0 && close > edit, "edit first, state change last");
});

test("in-progress makes sure the label exists before editing, and never reopens an open issue", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "in-progress" });
  const seen = lines(calls);
  const made = seen.findIndex((j) => j.startsWith("label create in-progress"));
  const edit = seen.findIndex(
    (j) => j.startsWith("issue edit 7") && j.includes("--add-label in-progress"),
  );
  assert.ok(made >= 0 && edit > made);
  assert.equal(
    seen.some((j) => j.startsWith("issue reopen")),
    false,
  );
});

test("a failed label creation changes nothing about the issue", async () => {
  const { exec, calls } = fakeExec((args) =>
    args[0] === "label"
      ? { code: 1, stderr: "no permission" }
      : { stdout: JSON.stringify(issue({ state: "CLOSED" })) },
  );
  const r = await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "in-progress" });
  assert.equal(r.ok, false);
  assert.deepEqual(
    lines(calls).filter((j) => /^issue (edit|reopen|close)/.test(j)),
    [],
  );
});

test("a closed issue moved to open is reopened after the edit", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue({ state: "CLOSED" })) }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "open" });
  assert.ok(lines(calls).some((j) => j.startsWith("issue reopen 7")));
});

test("labels in a patch replace the issue's labels, as in the repo-files tracker", async () => {
  const { exec, calls } = fakeExec(() => ({
    stdout: JSON.stringify(issue({ labels: [{ name: "bug" }, { name: "old" }] })),
  }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { labels: ["bug", "new"] });
  const edit = lines(calls).find((j) => j.startsWith("issue edit 7")) ?? "";
  assert.match(edit, /--add-label new/);
  assert.match(edit, /--remove-label old/);
  assert.doesNotMatch(edit, /--add-label bug|--remove-label bug/);
});

test("comment runs gh issue comment with the body as one argument", async () => {
  const { exec, calls } = fakeExec(() => ({}));
  const r = await createGithubTracker({ exec, cwd: "/r" }).comment("7", "hello; world");
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0]?.args.slice(0, 5), ["issue", "comment", "7", "--body", "hello; world"]);
});

test("a gh failure is an error carrying its message; unparseable output is an error", async () => {
  const failing = fakeExec(() => ({ code: 1, stderr: "gh: not authenticated" }));
  const r = await createGithubTracker({ exec: failing.exec, cwd: "/r" }).get("7");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /not authenticated/);
  const junk = fakeExec(() => ({ stdout: "not json" }));
  assert.equal((await createGithubTracker({ exec: junk.exec, cwd: "/r" }).get("7")).ok, false);
});

test("the marker label is created without --force, and an existing label is fine", async () => {
  const { exec, calls } = fakeExec((args) =>
    args[0] === "label"
      ? { code: 1, stderr: 'label with name "in-progress" already exists' }
      : { stdout: JSON.stringify(issue()) },
  );
  const r = await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "in-progress" });
  assert.equal(r.ok, true);
  const made = lines(calls).find((j) => j.startsWith("label create")) ?? "";
  assert.doesNotMatch(made, /--force/);
  assert.ok(lines(calls).some((j) => j.includes("--add-label in-progress")));
});

test("closing an issue that never had the marker does not try to remove it", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "done" });
  assert.equal(
    lines(calls).some((j) => j.includes("--remove-label")),
    false,
  );
  assert.ok(lines(calls).some((j) => j.startsWith("issue close 7")));
});

test("leaving in-progress removes the marker", async () => {
  const { exec, calls } = fakeExec(() => ({
    stdout: JSON.stringify(issue({ labels: [{ name: "in-progress" }] })),
  }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "open" });
  assert.ok(lines(calls).some((j) => j.includes("--remove-label in-progress")));
});

test("a closed issue that still carries the marker loses it when reopened", async () => {
  const { exec, calls } = fakeExec(() => ({
    stdout: JSON.stringify(issue({ state: "CLOSED", labels: [{ name: "in-progress" }] })),
  }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { status: "open" });
  const seen = lines(calls);
  assert.ok(seen.some((j) => j.includes("--remove-label in-progress")));
  assert.ok(seen.some((j) => j.startsWith("issue reopen 7")));
});

test("listing in-progress asks gh for the label so the limit cannot hide items", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: "[]" }));
  await createGithubTracker({ exec, cwd: "/r" }).list({ status: "in-progress" });
  assert.match(lines(calls)[0] ?? "", /--state open --label in-progress/);
});

test("a list that reached the limit is an error, not a silently short list", async () => {
  const many = Array.from({ length: 1000 }, (_, n) => issue({ number: n + 1 }));
  const { exec } = fakeExec(() => ({ stdout: JSON.stringify(many) }));
  const r = await createGithubTracker({ exec, cwd: "/r" }).list({});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /cut short/);
});

test("labels gh would split on commas, and one-line titles, are validated before gh runs", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  const t = createGithubTracker({ exec, cwd: "/r" });
  assert.equal((await t.create({ title: "ok", labels: ["needs,triage"] })).ok, false);
  assert.equal((await t.update("7", { labels: ["a,b"] })).ok, false);
  assert.equal(calls.length, 0);
});

test("a user label named in-progress is refused so it cannot change the status", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  const t = createGithubTracker({ exec, cwd: "/r" });
  assert.equal((await t.create({ title: "x", labels: ["in-progress"] })).ok, false);
  assert.equal((await t.update("7", { labels: ["in-progress"] })).ok, false);
  assert.equal(calls.length, 0);
});

test("the marker label is recognised whatever its case, and a user label in that case is refused", async () => {
  const { exec } = fakeExec(() => ({
    stdout: JSON.stringify(issue({ labels: [{ name: "In-Progress" }, { name: "bug" }] })),
  }));
  const t = createGithubTracker({ exec, cwd: "/r" });
  const got = await t.get("7");
  assert.ok(got.ok);
  assert.equal(got.value.status, "in-progress");
  assert.deepEqual(got.value.labels, ["bug"]);
  assert.equal((await t.create({ title: "x", labels: ["IN-PROGRESS"] })).ok, false);
});

test("a full page of closed issues is fine to list as done, but not as everything", async () => {
  const many = Array.from({ length: 1000 }, (_, n) => issue({ number: n + 1, state: "CLOSED" }));
  const { exec } = fakeExec(() => ({ stdout: JSON.stringify(many) }));
  const t = createGithubTracker({ exec, cwd: "/r" });
  assert.equal((await t.list({ status: "done" })).ok, true);
  const all = await t.list({});
  assert.equal(all.ok, false);
  const open = await t.list({ status: "open" });
  assert.equal(open.ok, false);
  if (!open.ok) assert.doesNotMatch(open.error.message, /narrow/);
});

test("labels that differ only in case are the same label when replacing", async () => {
  const { exec, calls } = fakeExec(() => ({
    stdout: JSON.stringify(issue({ labels: [{ name: "Bug" }] })),
  }));
  await createGithubTracker({ exec, cwd: "/r" }).update("7", { labels: ["bug"], title: "t" });
  const edit = lines(calls).find((j) => j.startsWith("issue edit 7")) ?? "";
  assert.doesNotMatch(edit, /--add-label|--remove-label/);
});
