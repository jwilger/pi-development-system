import assert from "node:assert/strict";
import test from "node:test";
import { pushTargets } from "../../src/core/push-command.ts";

test("no push means no targets", () => {
  assert.deepEqual(pushTargets("git status && git commit -m x"), []);
  assert.deepEqual(pushTargets("echo git push"), []);
});

test("bare push has no remote and no branches", () => {
  assert.deepEqual(pushTargets("git push"), [
    { remote: undefined, branches: [], allBranches: false, usesHead: false, tagsOnly: false },
  ]);
});

test("remote and branch, with options and refspecs", () => {
  assert.deepEqual(pushTargets("git push -u origin main"), [
    { remote: "origin", branches: ["main"], allBranches: false, usesHead: false, tagsOnly: false },
  ]);
  assert.deepEqual(pushTargets("git push origin HEAD:main"), [
    { remote: "origin", branches: ["main"], allBranches: false, usesHead: false, tagsOnly: false },
  ]);
  assert.deepEqual(pushTargets("git push origin feature:refs/heads/trunk"), [
    { remote: "origin", branches: ["trunk"], allBranches: false, usesHead: false, tagsOnly: false },
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

test("pushes inside shells, keywords and wrappers are found", () => {
  for (const c of [
    "bash -c 'git push origin main'",
    'sh -c "git push origin main"',
    "eval 'git push origin main'",
    "if true; then git push origin main; fi",
    "{ git push origin main; }",
    "! git push origin main",
    "env -i git push origin main",
    "timeout 30 git push origin main",
    "for i in 1; do git push origin main; done",
    "echo $(git push origin main)",
  ]) {
    assert.equal(pushTargets(c).at(0)?.branches.at(0), "main", c);
  }
});

test("a push through an opaque runner is assumed to hit every branch", () => {
  assert.equal(pushTargets("echo main | xargs git push origin").at(0)?.allBranches, true);
  assert.equal(pushTargets("$GIT push origin main").at(0)?.allBranches, true);
  assert.deepEqual(pushTargets("echo main | xargs echo"), []);
});

test("dynamic or glob destinations may be any branch", () => {
  for (const c of [
    'git push origin "$BRANCH"',
    "git push origin $(git branch --show-current)",
    "git push origin 'refs/heads/*:refs/heads/*'",
    "git push origin HEAD:$B",
  ]) {
    assert.equal(pushTargets(c).at(0)?.allBranches, true, c);
  }
});

test("--repo=value is not a branch", () => {
  assert.deepEqual(pushTargets("git push --repo=origin main").at(0)?.branches, ["main"]);
});

test("--config-env is a global option with a value", () => {
  assert.equal(pushTargets("git --config-env user.name=HOME push origin main").length, 1);
});

test("heads/main names the main branch; cd and -C record where the push runs", () => {
  assert.deepEqual(pushTargets("git push origin HEAD:heads/main").at(0)?.branches, ["main"]);
  assert.equal(pushTargets("git -C ../wt push").at(0)?.dir, "../wt");
  assert.equal(pushTargets("cd ../wt && git push").at(0)?.dir, "../wt");
  assert.equal(pushTargets("git push").at(0)?.dir, undefined);
});

test("dry runs push nothing; tag-only pushes name no branch; HEAD alongside a branch is kept", () => {
  assert.equal(pushTargets("git push --dry-run origin main").length, 0);
  assert.equal(pushTargets("git push -n origin main").length, 0);
  assert.equal(pushTargets("git push --tags").at(0)?.tagsOnly, true);
  assert.equal(pushTargets("git push --follow-tags").at(0)?.tagsOnly, false);
  assert.equal(pushTargets("git push origin HEAD feat").at(0)?.usesHead, true);
});

test("redirects are not push arguments", () => {
  for (const c of [
    "git push 2>&1",
    "git push >/dev/null 2>&1",
    "git push 2> err.txt",
    "timeout 60 git push 2>&1",
  ]) {
    assert.deepEqual(pushTargets(c).at(0)?.branches, [], c);
    assert.equal(pushTargets(c).at(0)?.remote, undefined, c);
  }
  assert.equal(pushTargets("git push origin 2>&1").at(0)?.remote, "origin");
});
