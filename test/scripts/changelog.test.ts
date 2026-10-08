import assert from "node:assert/strict";
import test from "node:test";
import {
  type Commit,
  groupReleases,
  parseSubject,
  renderChangelog,
} from "../../scripts/lib/changelog.ts";

const commit = (sha: string, subject: string, date = "2026-10-01"): Commit => ({
  sha,
  subject,
  date,
});

test("a Conventional Commit subject is split into type, scope, breaking flag and text", () => {
  assert.deepEqual(parseSubject("feat(review): reviewers submit results (I9b)"), {
    type: "feat",
    scope: "review",
    breaking: false,
    text: "reviewers submit results (I9b)",
  });
  assert.deepEqual(parseSubject("fix!: drop the old flag"), {
    type: "fix",
    breaking: true,
    text: "drop the old flag",
  });
  assert.equal(parseSubject("tidy things up"), undefined);
});

test("each commit belongs to the first release at or after it; later ones are unreleased", () => {
  const commits = [
    commit("a1", "feat: one"),
    commit("a2", "chore: bump to 0.2.0"),
    commit("a3", "fix: two"),
    commit("a4", "feat: three"),
    commit("a5", "chore: bump to 0.3.0", "2026-10-03"),
    commit("a6", "fix: four"),
  ];
  const releases = groupReleases(commits, [
    { sha: "a2", version: "0.2.0" },
    { sha: "a5", version: "0.3.0" },
  ]);
  assert.deepEqual(
    releases.map((r) => [r.version, r.commits.map((c) => c.sha)]),
    [
      ["Unreleased", ["a6"]],
      ["0.3.0", ["a3", "a4", "a5"]],
      ["0.2.0", ["a1", "a2"]],
    ],
  );
  assert.equal(releases[1]?.date, "2026-10-03");
});

test("with nothing after the last release there is no Unreleased section", () => {
  const releases = groupReleases([commit("a1", "feat: one")], [{ sha: "a1", version: "0.1.0" }]);
  assert.deepEqual(
    releases.map((r) => r.version),
    ["0.1.0"],
  );
});

test("the rendering lists breaking changes, features and fixes first, then the rest, newest release first", () => {
  const text = renderChangelog([
    {
      version: "0.2.0",
      date: "2026-10-02",
      commits: [
        commit("aaaaaaa1", "docs: explain the config"),
        commit("bbbbbbb2", "fix(gates): refuse with no UI"),
        commit("ccccccc3", "feat(review)!: typed results"),
        commit("ddddddd4", "feat: a new tool"),
        commit("eeeeeee5", "not conventional"),
      ],
    },
    { version: "0.1.0", date: "2026-10-01", commits: [commit("fffffff6", "feat: first")] },
  ]);
  const lines = text.split("\n");
  assert.equal(lines[0], "# Changelog");
  const i2 = lines.indexOf("## 0.2.0 - 2026-10-02");
  const i1 = lines.indexOf("## 0.1.0 - 2026-10-01");
  assert.ok(i2 > 0 && i1 > i2, "newest release first");
  const body = lines.slice(i2, i1).join("\n");
  assert.ok(body.indexOf("Breaking changes") < body.indexOf("Features"));
  assert.ok(body.indexOf("Features") < body.indexOf("Fixes"));
  assert.ok(body.indexOf("Fixes") < body.indexOf("Other"));
  assert.match(body, /- \*\*review:\*\* typed results \(`ccccccc`\)/);
  assert.match(body, /- a new tool \(`ddddddd`\)/);
  assert.match(body, /- not conventional \(`eeeeeee`\)/);
  assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
});

test("a feature that is also breaking is listed once, under breaking changes", () => {
  const text = renderChangelog([
    { version: "1.0.0", date: "2026-10-02", commits: [commit("ccccccc3", "feat!: new contract")] },
  ]);
  assert.equal(text.match(/new contract/g)?.length, 1);
  assert.doesNotMatch(text, /Features/);
});

test("the subject's own markdown characters cannot break the list", () => {
  const text = renderChangelog([
    {
      version: "0.1.0",
      date: "2026-10-01",
      commits: [commit("abcdef12", "fix: handle *stars* and <tags> [x]")],
    },
  ]);
  assert.match(text, /handle \\\*stars\\\* and &lt;tags&gt; \\\[x\\\]/);
});
