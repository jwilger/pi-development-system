import assert from "node:assert/strict";
import test from "node:test";
import { parseItem, renderBacklog, renderItem } from "../../src/tracker/item-format.ts";
import type { WorkItem } from "../../src/tracker/types.ts";

const item: WorkItem = {
  id: "trim-emails",
  title: "Trim emails on login",
  body: "Logging in with a trailing space must work.\n\n## Notes\n\nSee T-4.",
  status: "in-progress",
  labels: ["bug", "auth"],
  comments: ["First look: normalizeEmail is missing.", "Second\nline."],
};

test("an item survives render then parse", () => {
  const parsed = parseItem("trim-emails", renderItem(item));
  assert.deepEqual(parsed, { ok: true, value: item });
});

test("a body containing a Comments heading is not mistaken for the comment section", () => {
  const tricky = { ...item, body: "text\n\n## Comments\n\nnot ours", comments: [] };
  assert.deepEqual(parseItem("x", renderItem({ ...tricky, id: "x" })), {
    ok: true,
    value: { ...tricky, id: "x" },
  });
});

test("an item with no labels or comments round-trips", () => {
  const bare: WorkItem = {
    id: "a",
    title: "A",
    body: "",
    status: "open",
    labels: [],
    comments: [],
  };
  assert.deepEqual(parseItem("a", renderItem(bare)), { ok: true, value: bare });
});

test("a file without a title or with an unknown status is an error naming the problem", () => {
  const noTitle = parseItem("a", "Status: open\n");
  assert.equal(noTitle.ok, false);
  const badStatus = parseItem("a", "# T\n\nStatus: nope\nLabels:\n\n## Comments\n");
  assert.equal(badStatus.ok, false);
  if (!badStatus.ok) assert.match(badStatus.error.message, /status/i);
});

test("the backlog lists every item with its status, open work first", () => {
  const text = renderBacklog([
    { ...item, id: "done-one", title: "Done", status: "done" },
    { ...item, id: "open-one", title: "Open", status: "open" },
    item,
  ]);
  const lines = text.split("\n").filter((l) => l.startsWith("- "));
  assert.deepEqual(lines, [
    "- [ ] open-one — Open",
    "- [ ] trim-emails — Trim emails on login (in-progress)",
    "- [x] done-one — Done",
  ]);
});
