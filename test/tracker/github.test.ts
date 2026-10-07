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

test("update to done closes; to in-progress labels and reopens; edits go through gh issue edit", async () => {
  const { exec, calls } = fakeExec(() => ({ stdout: JSON.stringify(issue()) }));
  const t = createGithubTracker({ exec, cwd: "/r" });
  await t.update("7", { status: "done", title: "New" });
  const joined = calls.map((c) => c.args.join(" "));
  assert.ok(joined.some((j) => j.startsWith("issue close 7")));
  assert.ok(joined.some((j) => j.startsWith("issue edit 7") && j.includes("--title New")));
  calls.length = 0;
  await t.update("7", { status: "in-progress" });
  const second = calls.map((c) => c.args.join(" "));
  assert.ok(
    second.some((j) => j.startsWith("issue edit 7") && j.includes("--add-label in-progress")),
  );
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
