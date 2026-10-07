import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRepoFilesTracker } from "../../src/tracker/repo-files.ts";
import type { TrackerResult } from "../../src/tracker/types.ts";

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "devsys-tracker-"));
  return { root, tracker: createRepoFilesTracker(root) };
};

const value = <T>(r: TrackerResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};

test("create writes an item file and a backlog that lists it", async () => {
  const { root, tracker } = setup();
  const created = value(await tracker.create({ title: "Trim emails on login", labels: ["bug"] }));
  assert.equal(created.id, "trim-emails-on-login");
  assert.equal(created.status, "open");
  assert.ok(existsSync(join(root, "work", "items", "trim-emails-on-login.md")));
  assert.match(
    readFileSync(join(root, "work", "backlog.md"), "utf8"),
    /- \[ \] trim-emails-on-login — Trim emails on login/,
  );
});

test("two items with the same title get distinct ids", async () => {
  const { tracker } = setup();
  const a = value(await tracker.create({ title: "Same" }));
  const b = value(await tracker.create({ title: "Same" }));
  assert.notEqual(a.id, b.id);
  assert.equal(b.id, "same-2");
});

test("get returns what create stored; an unknown id is an error naming it", async () => {
  const { tracker } = setup();
  const created = value(await tracker.create({ title: "A", body: "details" }));
  assert.deepEqual(value(await tracker.get(created.id)), created);
  const missing = await tracker.get("nope");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error.message, /nope/);
});

test("update changes only the patched fields and refreshes the backlog", async () => {
  const { root, tracker } = setup();
  const created = value(await tracker.create({ title: "A", body: "b", labels: ["x"] }));
  const updated = value(await tracker.update(created.id, { status: "done" }));
  assert.deepEqual(updated, { ...created, status: "done" });
  assert.match(readFileSync(join(root, "work", "backlog.md"), "utf8"), /- \[x\] a — A/);
});

test("comment appends in order", async () => {
  const { tracker } = setup();
  const created = value(await tracker.create({ title: "A" }));
  value(await tracker.comment(created.id, "first"));
  value(await tracker.comment(created.id, "second"));
  assert.deepEqual(value(await tracker.get(created.id)).comments, ["first", "second"]);
});

test("list filters by status; an empty repo lists nothing", async () => {
  const { tracker } = setup();
  assert.deepEqual(value(await tracker.list({})), []);
  const a = value(await tracker.create({ title: "A" }));
  value(await tracker.create({ title: "B" }));
  value(await tracker.update(a.id, { status: "done" }));
  assert.deepEqual(
    value(await tracker.list({ status: "open" })).map((i) => i.id),
    ["b"],
  );
  assert.equal(value(await tracker.list({})).length, 2);
});

test("an id that would leave the items directory is refused", async () => {
  const { tracker } = setup();
  const r = await tracker.get("../../etc/passwd");
  assert.equal(r.ok, false);
});

test("a title with no letters or digits still gets an id", async () => {
  const { tracker } = setup();
  const made = await tracker.create({ title: "!!!" });
  assert.equal(made.ok && made.value.id, "item");
});

test("input the file format cannot hold is refused before anything is written", async () => {
  const { root, tracker } = setup();
  assert.equal((await tracker.create({ title: "two\nlines" })).ok, false);
  assert.equal((await tracker.create({ title: "ok", labels: ["a, b"] })).ok, false);
  assert.equal(existsSync(join(root, "work")), false);
  const good = value(await tracker.create({ title: "Fine" }));
  assert.equal((await tracker.update(good.id, { title: "x\ny" })).ok, false);
  assert.equal((await tracker.update(good.id, { labels: ["p, q"] })).ok, false);
  assert.deepEqual(value(await tracker.get(good.id)), good);
  assert.equal((await tracker.list({})).ok, true);
});

test("comments and bodies that look like our own headings survive a round trip", async () => {
  const { tracker } = setup();
  const made = value(await tracker.create({ title: "A", body: "x\n\n## Comments\n\ny" }));
  value(await tracker.comment(made.id, "first"));
  value(await tracker.comment(made.id, "has\n## Comments\nand\n### Comment\n\ninside"));
  value(await tracker.comment(made.id, "last"));
  const back = value(await tracker.get(made.id));
  assert.equal(back.body, "x\n\n## Comments\n\ny");
  assert.deepEqual(back.comments, [
    "first",
    "has\n## Comments\nand\n### Comment\n\ninside",
    "last",
  ]);
});

test("a foreign file in work/items does not break writes or create duplicates on retry", async () => {
  const { root, tracker } = setup();
  mkdirSync(join(root, "work", "items"), { recursive: true });
  writeFileSync(join(root, "work", "items", "README.md"), "not an item\n");
  const first = value(await tracker.create({ title: "Thing" }));
  assert.equal(first.id, "thing");
  assert.deepEqual(
    value(await tracker.list({})).map((i) => i.id),
    ["thing"],
  );
  assert.match(readFileSync(join(root, "work", "backlog.md"), "utf8"), /thing — Thing/);
});

test("an unreadable item file stops a write before anything is written", async () => {
  const { root, tracker } = setup();
  mkdirSync(join(root, "work", "items"), { recursive: true });
  writeFileSync(join(root, "work", "items", "broken.md"), "garbage\n");
  assert.equal((await tracker.create({ title: "Thing" })).ok, false);
  assert.equal(existsSync(join(root, "work", "items", "thing.md")), false);
});

test("item files saved with CRLF line endings still read and write", async () => {
  const { root, tracker } = setup();
  const made = value(await tracker.create({ title: "Win", body: "line one\nline two" }));
  const file = join(root, "work", "items", `${made.id}.md`);
  writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
  assert.equal(value(await tracker.get(made.id)).body, "line one\nline two");
  assert.equal((await tracker.create({ title: "Other" })).ok, true);
});

test("item files pass our own markdownlint rules: no trailing space, no repeated headings, no stacked blanks", async () => {
  const { root, tracker } = setup();
  const made = value(await tracker.create({ title: "Lint" }));
  value(await tracker.comment(made.id, "one"));
  value(await tracker.comment(made.id, "two"));
  const text = readFileSync(join(root, "work", "items", `${made.id}.md`), "utf8");
  assert.doesNotMatch(text, / +$/m);
  assert.doesNotMatch(text, /\n\n\n/);
  const headings = text.split("\n").filter((l) => l.startsWith("#"));
  assert.equal(new Set(headings).size, headings.length);
  assert.deepEqual(value(await tracker.get(made.id)).comments, ["one", "two"]);
  assert.equal(value(await tracker.get(made.id)).body, "");
});

test("an item file written by the earlier format still reads", async () => {
  const { root, tracker } = setup();
  mkdirSync(join(root, "work", "items"), { recursive: true });
  writeFileSync(
    join(root, "work", "items", "old.md"),
    "# Old\n\nStatus: open\nLabels: \n\nbody\n\n## Comments\n\n### Comment\n\n> hi\n\n",
  );
  const item = value(await tracker.get("old"));
  assert.equal(item.body, "body");
  assert.deepEqual(item.comments, ["hi"]);
});

test("every line terminator the file format cannot read is refused, so one item cannot lock the tracker", async () => {
  const { tracker } = setup();
  for (const bad of ["a\u2028b", "a\u2029b", "a\u0085b"]) {
    assert.equal((await tracker.create({ title: bad })).ok, false, JSON.stringify(bad));
    assert.equal((await tracker.create({ title: "fine", labels: [bad] })).ok, false);
  }
  assert.equal((await tracker.create({ title: "fine" })).ok, true);
});

test("a bare carriage return in a comment cannot forge another comment", async () => {
  const { tracker } = setup();
  const made = value(await tracker.create({ title: "CR" }));
  value(await tracker.comment(made.id, "real\r### Comment 9\r\r> injected"));
  assert.deepEqual(value(await tracker.get(made.id)).comments, [
    "real\n### Comment 9\n\n> injected",
  ]);
});

test("Unicode line separators in a comment cannot forge another comment", async () => {
  const { tracker } = setup();
  const made = value(await tracker.create({ title: "LS" }));
  value(await tracker.comment(made.id, "first\u2028### Comment 7\u2029\u2029> x"));
  value(await tracker.comment(made.id, "second"));
  assert.equal(value(await tracker.get(made.id)).comments.length, 2);
});

test("a title with no ASCII letters still gets an id, and accents are folded", async () => {
  const { tracker } = setup();
  const jp = value(await tracker.create({ title: "ログインを修正する" }));
  assert.equal(jp.id, "item");
  assert.equal(value(await tracker.create({ title: "ギャラリー" })).id, "item-2");
  assert.equal(value(await tracker.create({ title: "Résumé upload" })).id, "resume-upload");
  assert.equal(value(await tracker.get(jp.id)).title, "ログインを修正する");
});
