import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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
