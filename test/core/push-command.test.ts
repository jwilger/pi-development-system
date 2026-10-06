import assert from "node:assert/strict";
import test from "node:test";
import { pushTargets } from "../../src/core/push-command.ts";

test("no push means no targets", () => {
  assert.deepEqual(pushTargets("git status && git commit -m x"), []);
  assert.deepEqual(pushTargets("echo git push"), []);
});

test("bare push has no remote and no branches", () => {
  assert.deepEqual(pushTargets("git push"), [
    { remote: undefined, branches: [], allBranches: false },
  ]);
});

test("remote and branch, with options and refspecs", () => {
  assert.deepEqual(pushTargets("git push -u origin main"), [
    { remote: "origin", branches: ["main"], allBranches: false },
  ]);
  assert.deepEqual(pushTargets("git push origin HEAD:main"), [
    { remote: "origin", branches: ["main"], allBranches: false },
  ]);
  assert.deepEqual(pushTargets("git push origin feature:refs/heads/trunk"), [
    { remote: "origin", branches: ["trunk"], allBranches: false },
  ]);
  assert.deepEqual(pushTargets("git push origin HEAD").at(0)?.branches, []);
});

test("--all and --mirror target every branch; value options are skipped", () => {
  assert.equal(pushTargets("git push --all origin").at(0)?.allBranches, true);
  assert.equal(pushTargets("git push --mirror").at(0)?.allBranches, true);
  assert.deepEqual(pushTargets("git push -o ci.skip origin main").at(0)?.branches, ["main"]);
});

test("pushes inside chains and after cd are found", () => {
  assert.equal(pushTargets("cd x && git add -A && git push origin main").length, 1);
  assert.equal(pushTargets("git -C sub push origin main").length, 1);
});
