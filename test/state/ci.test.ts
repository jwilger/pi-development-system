import assert from "node:assert/strict";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { getFailureLog, getTrunkStatus, parseRunList } from "../../src/state/ci.ts";

const run = (status: string, conclusion: string) =>
  JSON.stringify([{ status, conclusion, headSha: "abc123" }]);

test("parseRunList maps runs to green/red/pending/unknown", () => {
  assert.deepEqual(parseRunList(run("completed", "success")), {
    status: "green",
    headSha: "abc123",
  });
  assert.equal(parseRunList(run("completed", "failure")).status, "red");
  assert.equal(parseRunList(run("completed", "timed_out")).status, "red");
  assert.equal(parseRunList(run("in_progress", "")).status, "pending");
  assert.equal(parseRunList(run("queued", "")).status, "pending");
  assert.equal(parseRunList(run("completed", "cancelled")).status, "unknown");
  assert.equal(parseRunList("[]").status, "unknown");
  assert.equal(parseRunList("not json").status, "unknown");
  assert.equal(parseRunList("{}").status, "unknown");
});

test("getTrunkStatus asks gh for the newest run on the branch", async () => {
  let seen: string[] = [];
  const status = await getTrunkStatus(
    async (cmd, args) => {
      seen = [cmd, ...args];
      return { code: 0, stdout: run("completed", "failure"), stderr: "" };
    },
    { branch: "main" },
  );
  assert.equal(status.status, "red");
  assert.deepEqual(seen.slice(0, 6), ["gh", "run", "list", "--branch", "main", "--limit"]);
});

test("a failing or throwing gh is unknown, never red", async () => {
  assert.equal(
    (
      await getTrunkStatus(async () => ({ code: 1, stdout: "", stderr: "no auth" }), {
        branch: "main",
      })
    ).status,
    "unknown",
  );
  assert.equal(
    (
      await getTrunkStatus(
        async () => {
          throw new Error("ENOENT");
        },
        { branch: "main" },
      )
    ).status,
    "unknown",
  );
});

test("getFailureLog asks gh for a specific run id and is empty without one", async () => {
  const calls: string[][] = [];
  const exec: Exec = async (_cmd, args) => {
    calls.push([...args]);
    return { code: 0, stdout: "boom", stderr: "" };
  };
  assert.equal(await getFailureLog(exec, "/x", undefined), "");
  assert.equal(calls.length, 0);
  assert.equal(await getFailureLog(exec, "/x", 42), "boom");
  assert.deepEqual(calls[0], ["run", "view", "42", "--log-failed"]);
});

test("parseRunList reads the run id", () => {
  const out = JSON.stringify([
    { status: "completed", conclusion: "failure", headSha: "abc", databaseId: 7 },
  ]);
  assert.equal(parseRunList(out).runId, 7);
});
