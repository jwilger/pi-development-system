import assert from "node:assert/strict";
import test from "node:test";
import {
  findForbiddenTrailerKeys,
  findForbiddenTrailers,
  hasRationaleBody,
  parseConventionalCommit,
} from "../../src/core/commit-message.ts";

const RATIONALE =
  "Slots hold ordered candidates so one committed file works for collaborators with different accounts.";

test("parses type, scope, breaking marker, subject, body and trailers", () => {
  const r = parseConventionalCommit(
    `feat(config)!: add matrix\n\n${RATIONALE}\n\nBREAKING CHANGE: slots renamed\nRefs: #12`,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.type, "feat");
  assert.equal(r.value.scope, "config");
  assert.equal(r.value.breaking, true);
  assert.equal(r.value.subject, "add matrix");
  assert.equal(r.value.body, RATIONALE);
  assert.deepEqual(r.value.trailers, [
    { key: "BREAKING CHANGE", value: "slots renamed" },
    { key: "Refs", value: "#12" },
  ]);
});

test("a subject-only message parses with an empty body and no scope", () => {
  const r = parseConventionalCommit("fix: stop crashing");
  assert.equal(r.ok && r.value.body, "");
  assert.equal(r.ok && r.value.scope, undefined);
  assert.equal(r.ok && r.value.breaking, false);
});

test("a BREAKING CHANGE trailer marks the commit breaking", () => {
  const r = parseConventionalCommit("feat: x\n\nwhy\n\nBREAKING CHANGE: gone");
  assert.equal(r.ok && r.value.breaking, true);
});

for (const bad of [
  "",
  "update stuff",
  "Feat: caps",
  "feat:no space",
  "feat(): empty scope",
  "wip",
  "feat: ",
]) {
  test(`rejects non-conventional subject ${JSON.stringify(bad)}`, () => {
    assert.equal(parseConventionalCommit(bad).ok, false);
  });
}

test("comment lines from git are ignored", () => {
  const r = parseConventionalCommit("fix: a thing\n\n# Please enter the commit message\n# more");
  assert.equal(r.ok && r.value.body, "");
});

const forbidden = [
  "Co-Authored-By: Claude <noreply@anthropic.com>",
  "co-authored-by: someone <a@b.c>",
  "Generated-By: gpt",
  "Signed-off-by: Claude AI <ai@x.y>",
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
];
for (const line of forbidden) {
  test(`forbidden trailer: ${line.slice(0, 30)}`, () => {
    assert.deepEqual(findForbiddenTrailers(`feat: x\n\nwhy\n\n${line}`), [line]);
  });
}

test("a human Signed-off-by and ordinary text are not forbidden", () => {
  assert.deepEqual(findForbiddenTrailers("fix: x\n\nSigned-off-by: Jane Doe <j@x.y>"), []);
  assert.deepEqual(findForbiddenTrailers("fix: mention Co-Authored-By handling in docs"), []);
});

test("extra forbidden keys are configurable", () => {
  assert.deepEqual(findForbiddenTrailers("fix: x\n\nReviewed-By: bot", ["Reviewed-By"]), [
    "Reviewed-By: bot",
  ]);
});

test("rationale body: prose paragraph counts", () => {
  assert.equal(hasRationaleBody(`fix: x\n\n${RATIONALE}`), true);
});

test("rationale body: no body, bullet-only, tiny and trailer-only bodies do not count", () => {
  assert.equal(hasRationaleBody("fix: x"), false);
  assert.equal(hasRationaleBody("fix: x\n\n- src/a.ts\n- src/b.ts"), false);
  assert.equal(hasRationaleBody("fix: x\n\nupdate files"), false);
  assert.equal(hasRationaleBody("fix: x\n\nRefs: #1"), false);
  assert.equal(hasRationaleBody("fix: x\n\n* a\n* b\n\nRefs: #1"), false);
});

test("rationale body: bullets plus a prose paragraph count", () => {
  assert.equal(hasRationaleBody(`fix: x\n\n- a\n- b\n\n${RATIONALE}`), true);
});

test("a trailer-shaped line with a sentence value counts as rationale prose", () => {
  assert.equal(
    hasRationaleBody("feat: x\n\nReason: the cache was stale so entries leaked across users"),
    true,
  );
  assert.equal(hasRationaleBody("feat: x\n\nRefs: #12"), false);
});

test("AI trailer keys are found anywhere in free text", () => {
  assert.equal(findForbiddenTrailerKeys(`printf 'x\\nCo-Authored-By: Claude'`).length, 1);
  assert.equal(findForbiddenTrailerKeys("fix: mention co-authored-by handling").length, 0);
});

test("bullets that explain the change are a rationale; terse file lists are not", () => {
  const why =
    "fix: x\n\n- Expired tokens were accepted because the clock check used issue time\n- Sessions outliving their grant is a security defect";
  assert.equal(hasRationaleBody(why), true);
  assert.equal(hasRationaleBody("fix: x\n\n1. src/a.ts\n2. src/b.ts"), false);
});
