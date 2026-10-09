import assert from "node:assert/strict";
import test from "node:test";
import { opaqueMentions, resolveGit } from "../../src/core/git-invocations.ts";

const subs = (command: string): string[] => resolveGit(command).invocations.map((g) => g.sub);

test("simple, chained and wrapped git commands are all found", () => {
  assert.deepEqual(subs("git status && git commit -m x; git push"), ["status", "commit", "push"]);
  assert.deepEqual(subs("timeout 5 git push"), ["push"]);
  assert.deepEqual(subs("bash -c 'git push origin main'"), ["push"]);
  assert.deepEqual(subs("echo git push"), []);
  assert.deepEqual(subs('timeout 300 bash -c "git commit -m x && git push origin main"'), [
    "commit",
    "push",
  ]);
  assert.deepEqual(subs("sudo -E bash -c 'git push origin main'"), ["push"]);
  assert.deepEqual(subs("env -S 'git push origin main'"), ["push"]);
  assert.deepEqual(subs('gh pr create --title "fix: git push origin main asks first"'), []);
  assert.deepEqual(subs("/usr/lib/git-core/git-commit -m x"), ["commit"]);
});

test("an apostrophe inside a heredoc body does not hide a later push", () => {
  const command =
    "git commit -F - <<'EOF'\nfix: don't crash\n\nBecause it is broken.\nEOF\ngit push origin main";
  assert.deepEqual(subs(command), ["commit", "push"]);
  assert.deepEqual(subs(command.replace("<<'EOF'", "<<EOF")), ["commit", "push"]);
});

test("git inside a heredoc body is data, not a command", () => {
  assert.deepEqual(subs("cat <<'EOF'\ngit push origin main\nEOF"), []);
});

test("an opaque runner is flagged", () => {
  assert.equal(opaqueMentions(resolveGit("echo main | xargs git push origin"), "push"), true);
  assert.equal(opaqueMentions(resolveGit("$GIT push origin"), "push"), true);
});

test("cd and -C record the directory; each invocation knows its line", () => {
  const r = resolveGit("cd ../wt\ngit -C sub push");
  assert.equal(r.invocations[0]?.dir, "../wt/sub");
  assert.equal(r.invocations[0]?.line, 1);
});
