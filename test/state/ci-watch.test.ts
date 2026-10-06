import assert from "node:assert/strict";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import type { CiState } from "../../src/core/types.ts";
import { watchCi } from "../../src/state/ci-watch.ts";

const run = (status: string, conclusion: string) => ({
  code: 0,
  stdout: JSON.stringify([{ status, conclusion, headSha: "abcdef1234" }]),
  stderr: "",
});

const scripted = (...results: ReturnType<typeof run>[]): Exec => {
  let i = 0;
  return async () => results[Math.min(i++, results.length - 1)] ?? run("completed", "success");
};

const options = (exec: Exec, observed: CiState[], maxPolls = 5) => {
  const sleeps: number[] = [];
  return {
    sleeps,
    value: {
      exec,
      branch: "main",
      cwd: "/x",
      onObserved: (o: CiState) => observed.push(o),
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      intervalMs: 5000,
      maxPolls,
    },
  };
};

test("polls while pending and stops at the first settled state", async () => {
  const observed: CiState[] = [];
  const o = options(
    scripted(run("in_progress", ""), run("in_progress", ""), run("completed", "failure")),
    observed,
  );
  const final = await watchCi(o.value);
  assert.deepEqual(final, { status: "red", sha: "abcdef1234" });
  assert.deepEqual(
    observed.map((s) => s.status),
    ["pending", "pending", "red"],
  );
  assert.deepEqual(o.sleeps, [5000, 5000]);
});

test("a settled first observation does not sleep", async () => {
  const observed: CiState[] = [];
  const o = options(scripted(run("completed", "success")), observed);
  assert.equal((await watchCi(o.value)).status, "green");
  assert.equal(o.sleeps.length, 0);
});

test("gives up with the last observation when the poll budget is spent", async () => {
  const observed: CiState[] = [];
  const o = options(scripted(run("queued", "")), observed, 3);
  assert.equal((await watchCi(o.value)).status, "pending");
  assert.equal(observed.length, 3);
});

test("gh failing reads as unknown and stops polling", async () => {
  const observed: CiState[] = [];
  const o = options(async () => ({ code: 1, stdout: "", stderr: "no auth" }), observed);
  assert.deepEqual(await watchCi(o.value), { status: "unknown" });
});

test("a run for a different commit stays pending until the expected commit's run appears", async () => {
  const observed: CiState[] = [];
  const o = options(
    scripted(run("completed", "success"), run("completed", "success")),
    observed,
    2,
  );
  const final = await watchCi({ ...o.value, expectSha: "ffffffffff" });
  assert.equal(final.status, "pending");
  const matching = options(scripted(run("completed", "success")), [], 2);
  assert.equal((await watchCi({ ...matching.value, expectSha: "abcdef1234" })).status, "green");
});

test("with expectSha, a missing gh reads as unknown rather than polling forever", async () => {
  const seen: string[] = [];
  const result = await watchCi({
    exec: async () => ({ code: 1, stdout: "", stderr: "gh: not found" }),
    branch: "main",
    cwd: ".",
    expectSha: "abc",
    maxPolls: 5,
    intervalMs: 0,
    sleep: async () => undefined,
    onObserved: (s) => seen.push(s.status),
  });
  assert.equal(result.status, "unknown");
  assert.deepEqual(seen, ["unknown"]);
});
