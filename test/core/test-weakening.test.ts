import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEdits,
  bashDeletedPaths,
  isPureAddition,
  weakeningSignals,
} from "../../src/core/test-weakening.ts";

test("adding a skip marker is a signal; unchanged skips are not", () => {
  assert.deepEqual(weakeningSignals("it('a', () => {})", "it.skip('a', () => {})"), {
    addsSkip: true,
    emptied: false,
  });
  assert.deepEqual(weakeningSignals("it.skip('a', f)", "it.skip('a', f)\nit('b', f)"), {
    addsSkip: false,
    emptied: false,
  });
});

test("recognises skip markers across ecosystems", () => {
  for (const after of [
    "xit('a', f)",
    "describe.skip('a', f)",
    "#[ignore]\nfn a() {}",
    "@pytest.mark.skip\ndef test_a(): pass",
    't.Skip("later")',
    "@Disabled\nvoid a() {}",
    "it.todo('a')",
    "@Ignore\npublic void a() {}",
  ]) {
    assert.equal(weakeningSignals("body", after).addsSkip, true, after);
  }
});

test("emptying a non-empty file is a signal", () => {
  assert.equal(weakeningSignals("it('a', f)", "  \n").emptied, true);
  assert.equal(weakeningSignals("", "").emptied, false);
});

test("applyEdits replaces each oldText once, in order", () => {
  assert.equal(
    applyEdits("a b c", [
      { oldText: "a", newText: "x" },
      { oldText: "c", newText: "z" },
    ]),
    "x b z",
  );
  assert.equal(applyEdits("a", [{ oldText: "missing", newText: "x" }]), "a");
});

test("isPureAddition: every original line survives", () => {
  assert.equal(isPureAddition("a\nb", "a\nnew\nb"), true);
  assert.equal(isPureAddition("a\nb", "a\nc"), false);
  assert.equal(isPureAddition("a\na", "a"), false);
});

test("bashDeletedPaths finds rm / git rm / unlink / mv-away targets", () => {
  assert.deepEqual(bashDeletedPaths("rm test/a.test.ts"), ["test/a.test.ts"]);
  assert.deepEqual(bashDeletedPaths("rm -rf test/ && echo ok"), ["test/"]);
  assert.deepEqual(bashDeletedPaths("git rm --cached x.test.ts y.ts"), ["x.test.ts", "y.ts"]);
  assert.deepEqual(bashDeletedPaths("unlink a.spec.js"), ["a.spec.js"]);
  assert.deepEqual(bashDeletedPaths("ls test"), []);
  assert.deepEqual(bashDeletedPaths("echo rm test/a.test.ts"), []);
});
