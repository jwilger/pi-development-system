import assert from "node:assert/strict";
import test from "node:test";
import { extractCommit, extractCommits } from "../../src/core/commit-command.ts";

const msg = (command: string) => {
  const r = extractCommit(command);
  return r.kind === "message" ? r.message : r;
};

test("non-commit commands are not commits", () => {
  for (const c of ["ls", "git status", "git log -m", "echo git commit -m x", "git push"]) {
    assert.equal(extractCommit(c).kind, "not-commit", c);
  }
});

test("-m with one or several messages", () => {
  assert.equal(msg('git commit -m "feat: a"'), "feat: a");
  assert.equal(msg("git commit -m 'feat: a' -m 'why we did it'"), "feat: a\n\nwhy we did it");
  assert.equal(msg("git commit -am 'fix: b'"), "fix: b");
  assert.equal(msg("git commit --message='fix: c'"), "fix: c");
  assert.equal(msg("git commit --message 'fix: d'"), "fix: d");
  assert.equal(msg("git commit -m'fix: e'"), "fix: e");
});

test("commit found after cd, &&, globals and wrappers", () => {
  assert.equal(msg("cd sub && git add -A && git commit -m 'fix: f'"), "fix: f");
  assert.equal(msg("git -C /tmp/x -c user.name=a commit -m 'fix: g'"), "fix: g");
  assert.equal(msg("cd a\ngit commit -m 'fix: h'"), "fix: h");
  assert.equal(msg("GIT_AUTHOR_NAME=x git commit -m 'fix: i'"), "fix: i");
});

test("heredoc inside command substitution is the message", () => {
  const command = [
    "git commit -m \"$(cat <<'EOF'",
    "feat(x): add thing",
    "",
    "Because the thing needs adding, for reasons that are explained.",
    "EOF",
    ')"',
  ].join("\n");
  assert.equal(
    msg(command),
    "feat(x): add thing\n\nBecause the thing needs adding, for reasons that are explained.",
  );
});

test("a plain heredoc via -F - is the message", () => {
  const command = "git commit -F - <<'EOF'\nfix: j\n\nbody words here for the reason\nEOF";
  assert.equal(msg(command), "fix: j\n\nbody words here for the reason");
});

test("-F file reports the path; no message source is unknown", () => {
  assert.deepEqual(extractCommit("git commit -F msg.txt"), { kind: "file", path: "msg.txt" });
  assert.deepEqual(extractCommit("git commit --file=msg.txt"), { kind: "file", path: "msg.txt" });
  assert.equal(extractCommit("git commit").kind, "unknown");
  assert.equal(extractCommit("git commit --amend --no-edit").kind, "unknown");
  assert.equal(extractCommit('git commit -m "$(./make-msg.sh)"').kind, "unknown");
});

test("an apostrophe in a heredoc body does not hide a later commit", () => {
  const command = ["cat > notes.txt <<'EOF'", "it's fine", "EOF", 'git commit -m "fix: k"'].join(
    "\n",
  );
  assert.equal(msg(command), "fix: k");
});

test("--trailer values are appended to the message", () => {
  assert.equal(
    msg("git commit -m 'fix: a' --trailer 'Co-Authored-By: X <x@y.z>'"),
    "fix: a\n\nCo-Authored-By: X <x@y.z>",
  );
  assert.equal(msg("git commit -m 'fix: a' --trailer='Refs: 1'"), "fix: a\n\nRefs: 1");
});

test("commits inside shells, keywords and wrappers are found", () => {
  for (const c of [
    `bash -c "git commit -m 'fix: z'"`,
    `eval "git commit -m 'fix: z'"`,
    "if true; then git commit -m 'fix: z'; fi",
    "env -i git commit -m 'fix: z'",
    "timeout 30 git commit -m 'fix: z'",
    "echo $(git commit -m 'fix: z')",
  ]) {
    assert.equal(msg(c), "fix: z", c);
  }
});

test("a commit through an opaque runner is unknown, not allowed as not-a-commit", () => {
  assert.equal(extractCommit("echo x | xargs git commit").kind, "unknown");
  assert.equal(extractCommit("$GIT commit -m x").kind, "unknown");
});

test("a glob argument does not hide the message", () => {
  assert.equal(msg("git commit src/*.ts -m 'fix: g'"), "fix: g");
});

test("unknown messages still expose --trailer values; -F- and --trailer= work", () => {
  const r = extractCommit("git commit --amend --no-edit --trailer 'Co-Authored-By: Claude'");
  assert.deepEqual(r, {
    kind: "unknown",
    trailers: ["Co-Authored-By: Claude"],
    opaqueMessage: false,
  });
  assert.deepEqual(extractCommit("git commit -F- <<'EOF'\nfix: a\nEOF").kind, "message");
  assert.deepEqual(extractCommit("git commit -Fmsg.txt"), { kind: "file", path: "msg.txt" });
});

test("every commit in a chain is extracted", () => {
  const all = extractCommits(
    "git commit -m 'feat: ok' && git commit -m x -m 'Co-Authored-By: Claude'",
  );
  assert.equal(all.length, 2);
  assert.equal(all[1]?.kind === "message" && all[1].message.includes("Co-Authored-By"), true);
});

test("abbreviated long options are read like git does", () => {
  assert.equal(msg("git commit --mess 'fix: a'"), "fix: a");
  assert.equal(
    msg("git commit -m 'fix: a' --trail 'Co-Authored-By: Claude'")
      .toString()
      .includes("Co-Authored-By"),
    true,
  );
  assert.deepEqual(extractCommit("git commit --fil=msg.txt"), { kind: "file", path: "msg.txt" });
});

test("stdin message files are heredoc-fed, not read from disk", () => {
  assert.equal(extractCommit("git commit -F /dev/stdin <<'EOF'\nfix: a\nEOF").kind, "message");
  assert.deepEqual(extractCommit("printf 'x' | git commit -F -"), { kind: "file", path: "-" });
});

test("a commit on the heredoc-opening line reads that heredoc", () => {
  const c = "cat <<'EOF' | git commit -F -\nfeat: x\n\nwhy it matters\nEOF";
  assert.deepEqual(extractCommit(c), { kind: "message", message: "feat: x\n\nwhy it matters" });
});

test("each commit pairs with its own heredoc", () => {
  const c = "git commit -F - <<'A'\nfeat: one\nA\ngit commit -F - <<'B'\nwip\nB";
  const all = extractCommits(c);
  assert.equal(all[0]?.kind === "message" && all[0].message, "feat: one");
  assert.equal(all[1]?.kind === "message" && all[1].message, "wip");
});

test("two-letter option abbreviations resolve like git", () => {
  assert.equal(extractCommit("git commit --me=wip").kind, "message");
  const t = extractCommit("git commit -m 'feat: a' --tr='Signed-off-by: Claude'");
  assert.equal(t.kind === "message" && t.message.includes("Signed-off-by"), true);
});

test("a variable message is opaque, not a literal", () => {
  assert.equal(extractCommit('git commit -m "$MSG"').kind, "unknown");
});

test("the heredoc after `commit` is the message, not an earlier notes heredoc", () => {
  const c =
    "cat > notes.md <<'EOF'\nsome notes\nEOF\ngit commit -m \"$(cat <<'EOF'\nfeat: real\nEOF\n)\"";
  assert.equal(msg(c), "feat: real");
});

test("-m plus a heredoc body joins both", () => {
  const c = "git commit -m 'feat: x' -m \"$(cat <<'EOF'\nwhy it matters here\nEOF\n)\"";
  assert.equal(msg(c), "feat: x\n\nwhy it matters here");
});

test("backticks and dollar signs inside prose are checked as text, not treated as substitutions", () => {
  assert.equal(extractCommit("git commit -m 'fix: handle `null` ids'").kind, "message");
  assert.equal(extractCommit("git commit -m 'fix: cost $5 now'").kind, "message");
  assert.equal(extractCommit('git commit -m "$(date)"').kind, "unknown");
});

test("an opaque -m value is flagged so the guard can refuse to guess", () => {
  const r = extractCommit('git commit -m "fix: x" -m "$(cat /tmp/m)"');
  assert.equal(r.kind === "unknown" && r.opaqueMessage, true);
});
