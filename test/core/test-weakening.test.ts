import assert from "node:assert/strict";
import test from "node:test";
import {
  addedLines,
  applyEdits,
  bashMutatedPaths,
  bashMutations,
  isPureAddition,
  weakeningSignals,
} from "../../src/core/test-weakening.ts";

test("adding a skip marker is a signal; unchanged skips are not", () => {
  assert.deepEqual(weakeningSignals("it('a', () => {})", "it.skip('a', () => {})"), {
    addsSkip: true,
    emptied: false,
    commentedOut: false,
  });
  assert.deepEqual(weakeningSignals("it.skip('a', f)", "it.skip('a', f)\nit('b', f)"), {
    addsSkip: false,
    emptied: false,
    commentedOut: false,
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
    "t.skip('later')",
    "test('a', { skip: true }, f)",
    "self.skipTest('later')",
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

test("bashMutatedPaths finds rm / git rm / unlink / mv-away targets", () => {
  assert.deepEqual(bashMutatedPaths("rm test/a.test.ts"), ["test/a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("rm -rf test/ && echo ok"), ["test/"]);
  assert.deepEqual(bashMutatedPaths("git rm --cached x.test.ts y.ts"), ["x.test.ts", "y.ts"]);
  assert.deepEqual(bashMutatedPaths("unlink a.spec.js"), ["a.spec.js"]);
  assert.deepEqual(bashMutatedPaths("ls test"), []);
  assert.deepEqual(bashMutatedPaths("echo rm test/a.test.ts"), []);
});

test("bashMutatedPaths sees globs, wrappers, absolute rm, bash -c and cd", () => {
  assert.deepEqual(bashMutatedPaths("rm test/*.ts"), ["test/*.ts"]);
  assert.deepEqual(bashMutatedPaths("/bin/rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("sudo rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("env FOO=1 command rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("bash -c 'rm a.test.ts'"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("git -C . rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("cd test && rm foo.ts"), ["test/foo.ts"]);
});

test("bashMutatedPaths sees move-away, find -delete, truncation, in-place edits and redirects", () => {
  assert.deepEqual(bashMutatedPaths("mv a.test.ts /tmp"), ["a.test.ts", "/tmp"]);
  assert.deepEqual(bashMutatedPaths("git mv a.test.ts b.ts"), ["a.test.ts", "b.ts"]);
  assert.deepEqual(bashMutatedPaths("find . -name '*.test.ts' -delete"), ["*.test.ts"]);
  assert.deepEqual(bashMutatedPaths("truncate -s 0 a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths(": > a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("sed -i s/a/b/ a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("cp /dev/null a.test.ts"), ["a.test.ts"]);
});

test("bashMutatedPaths ignores reads, appends and /dev/null redirects", () => {
  assert.deepEqual(bashMutatedPaths("cat a.test.ts"), []);
  assert.deepEqual(bashMutatedPaths("echo hi >> a.test.ts"), []);
  assert.deepEqual(bashMutatedPaths("npm test > /dev/null"), []);
  assert.deepEqual(bashMutatedPaths("find . -name '*.ts'"), []);
});

test("bashMutatedPaths splits newline-separated commands and sees through shell keywords", () => {
  assert.deepEqual(bashMutatedPaths("echo hi\nrm test/a.test.ts"), ["test/a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("echo hi \\\n  && rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("if true; then rm a.test.ts; fi"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("for f in x; do rm a.test.ts; done"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("{ rm a.test.ts; }"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("! rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("(rm a.test.ts)"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("timeout 5 rm a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("eval 'rm a.test.ts'"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("echo 'a\nrm b'"), []);
});

test("bashMutatedPaths sees &> redirects, dd of=, cp onto a path, and cd with flags", () => {
  assert.deepEqual(bashMutatedPaths("echo x &> a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("dd if=/dev/null of=a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("cp src/x.ts a.test.ts"), ["a.test.ts"]);
  assert.deepEqual(bashMutatedPaths("cd -P test && rm a.ts"), ["test/a.ts"]);
  assert.deepEqual(bashMutatedPaths("cd -- test && rm a.ts"), ["test/a.ts"]);
});

test("addedLines lists lines present after but not before", () => {
  assert.deepEqual(addedLines("a\nb", "a\nx\nb\ny"), ["x", "y"]);
  assert.deepEqual(addedLines("a", "a"), []);
});

test("skip markers cover .only, fit/fdescribe and pytest skipif/xfail", () => {
  for (const added of [
    "it.only('a', f)",
    "fit('a', f)",
    "fdescribe('a', f)",
    "@pytest.mark.skipif(x)",
    "@pytest.mark.xfail",
  ]) {
    assert.equal(weakeningSignals("x", `x\n${added}`).addsSkip, true, added);
  }
});

test("wrapping existing code in a block comment is a commentedOut signal; a doc comment is not", () => {
  const code = "it('a', () => {\n  assert.ok(1);\n});\n";
  assert.equal(weakeningSignals(code, `/*\n${code}*/\n`).commentedOut, true);
  assert.equal(weakeningSignals(code, `/** adds */\n${code}`).commentedOut, false);
  assert.equal(weakeningSignals(code, `${code}// note\n`).commentedOut, false);
});

test("todo placeholders are not skips; line comment-outs of existing code are", () => {
  assert.equal(weakeningSignals("a\n", "a\nit.todo('b')\n").addsSkip, false);
  const before = "it('a', () => {\n  assert.equal(f(), 1);\n});\n";
  const after = "it('a', () => {\n  // assert.equal(f(), 1);\n});\n";
  assert.equal(weakeningSignals(before, after).commentedOut, true);
  assert.equal(weakeningSignals(before, `${before}// assert.equal(g(), 2);\n`).commentedOut, false);
});

test("bashMutations tags removals and in-place rewrites; computed cd is ignored", () => {
  assert.deepEqual(bashMutations("rm tests/a.test.ts"), [
    { path: "tests/a.test.ts", kind: "remove" },
  ]);
  assert.deepEqual(bashMutations("sed -i s/a/b/ tests/a.test.ts"), [
    { path: "tests/a.test.ts", kind: "overwrite" },
  ]);
  assert.deepEqual(bashMutations("npm test 2>test/err.log"), [
    { path: "test/err.log", kind: "overwrite" },
  ]);
  assert.deepEqual(bashMutations(": > test/a.test.ts"), [
    { path: "test/a.test.ts", kind: "remove" },
  ]);
  assert.deepEqual(
    bashMutatedPaths('cd "$(git rev-parse --show-toplevel)" && rm tests/a.test.ts'),
    ["tests/a.test.ts"],
  );
});

test("ordinary code that resembles skip or comment markers is not a weakening signal", () => {
  const base = "def test_a():\n    assert 1\n";
  for (const added of [
    "clf.fit(X, y)",
    "docs = coll.find().skip(10)",
    "process.exit(1)",
    "const route = '/api/*'; run()",
  ]) {
    const s = weakeningSignals(base, `${base}${added}\ndef test_b():\n    assert 2\n`);
    assert.equal(s.addsSkip, false, added);
    assert.equal(s.commentedOut, false, added);
  }
});

test("find with name patterns flags the patterns, not the start dir; mv into a dir keeps the dir", () => {
  assert.deepEqual(bashMutatedPaths("find tests -name '*.pyc' -delete"), ["*.pyc"]);
  assert.deepEqual(bashMutatedPaths("find tests -type f -delete"), ["tests"]);
  assert.deepEqual(bashMutatedPaths("mv helper.ts test/"), ["helper.ts"]);
  assert.deepEqual(bashMutatedPaths("mv test/a.test.ts /tmp/x"), ["test/a.test.ts", "/tmp/x"]);
});
