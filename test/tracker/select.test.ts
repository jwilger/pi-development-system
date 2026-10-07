import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTracker } from "../../src/tracker/select.ts";

const exec = () => Promise.resolve({ code: 0, stdout: "", stderr: "" });
const cwd = () => mkdtempSync(join(tmpdir(), "devsys-select-"));

test("repo-files and github kinds select their adapters", () => {
  const files = createTracker({ tracker: { kind: "repo-files" }, exec, cwd: cwd() });
  assert.equal(files.ok && files.value.kind, "repo-files");
  const github = createTracker({ tracker: { kind: "github", repo: "o/r" }, exec, cwd: cwd() });
  assert.equal(github.ok && github.value.kind, "github");
});

test("jira and linear are configurable but say they are not implemented", () => {
  for (const kind of ["jira", "linear"] as const) {
    const r = createTracker({ tracker: { kind }, exec, cwd: cwd() });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error.message.includes(`"${kind}" is not implemented`), r.error.message);
  }
});
