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

test("a title with no letters or digits is refused", async () => {
  const { tracker } = setup();
  assert.equal((await tracker.create({ title: "!!!" })).ok, false);
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
