import assert from "node:assert/strict";
import test from "node:test";
import { nextAdrNumber, parseAdrTitle, renderAdr, slugify } from "../../src/planning/adr.ts";

const TEMPLATE =
  "# ADR NNNN: <title>\n\n- **Status:** proposed | accepted | superseded by NNNN\n- **Date:** YYYY-MM-DD\n\n## Context\n";

test("the next number follows the highest numbered ADR and ignores the template and other files", () => {
  assert.equal(nextAdrNumber(["0000-template.md", "0001-a.md", "0004-b.md", "README.md"]), 5);
  assert.equal(nextAdrNumber(["0000-template.md"]), 1);
  assert.equal(nextAdrNumber([]), 1);
});

test("a gap in numbering is not filled, so an old ADR number is never reused", () => {
  assert.equal(nextAdrNumber(["0001-a.md", "0003-c.md"]), 4);
});

test("a title becomes a lowercase kebab slug without punctuation", () => {
  assert.equal(slugify("Use  Postgres, not SQLite!"), "use-postgres-not-sqlite");
  assert.equal(slugify("  --Hello_World--  "), "hello-world");
});

test("a title is trimmed, and one with nothing to slug from is refused", () => {
  assert.deepEqual(parseAdrTitle("  Use X  "), { ok: true, value: "Use X" });
  for (const bad of ["", "   ", "!!!", "\n"]) {
    const r = parseAdrTitle(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
});

test("a title with a line break is refused so it cannot add lines to the document", () => {
  assert.equal(parseAdrTitle("one\n- **Status:** accepted").ok, false);
});

test("rendering fills the number, title, status and date and leaves the sections", () => {
  const text = renderAdr(TEMPLATE, { number: 5, title: "Use X", date: "2026-10-08" });
  assert.match(text, /^# ADR 0005: Use X$/m);
  assert.match(text, /^- \*\*Status:\*\* proposed$/m);
  assert.match(text, /^- \*\*Date:\*\* 2026-10-08$/m);
  assert.match(text, /^## Context$/m);
});

test("a title containing replacement patterns is written literally", () => {
  const text = renderAdr(TEMPLATE, { number: 1, title: "Use $& and $1", date: "2026-10-08" });
  assert.match(text, /^# ADR 0001: Use \$& and \$1$/m);
});
