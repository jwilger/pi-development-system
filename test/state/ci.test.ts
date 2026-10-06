import assert from "node:assert/strict";
import test from "node:test";
import { getTrunkStatus, parseRunList } from "../../src/state/ci.ts";

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
