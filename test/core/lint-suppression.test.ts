import assert from "node:assert/strict";
import test from "node:test";
import { findUnreasonedSuppressions } from "../../src/core/lint-suppression.ts";

const bare = (after: string, before = ""): string[] =>
  findUnreasonedSuppressions(before, after).map((s) => s.marker);

const reasoned: ReadonlyArray<readonly [string, string]> = [
  [
    "biome same line",
    "// biome-ignore lint/suspicious/noExplicitAny: boundary parse of foreign JSON\nlet x: any;",
  ],
  [
    "eslint with --",
    "// eslint-disable-next-line no-console -- cli prints progress for the user\nconsole.log(1);",
  ],
  [
    "eslint with colon",
    "// eslint-disable-next-line no-console: cli prints progress for the user\nconsole.log(1);",
  ],
  ["ts-expect-error text", "// @ts-expect-error: upstream types miss the overload\nfoo(1);"],
  ["ts-ignore text", "// @ts-ignore upstream types miss the overload entirely\nfoo(1);"],
  [
    "rust trailing comment",
    "#[allow(clippy::too_many_arguments)] // mirrors the C ABI exactly\nfn f() {}",
  ],
  [
    "rust reason attr",
    '#[allow(clippy::too_many_arguments, reason = "mirrors the C ABI exactly")]\nfn f() {}',
  ],
  [
    "rust comment above",
    "// Mirrors the C ABI exactly, so arity is fixed.\n#[allow(clippy::too_many_arguments)]\nfn f() {}",
  ],
  [
    "rust multi-line allow with reason",
    '#[allow(\n    clippy::too_many_arguments,\n    reason = "constructor mirrors the wire format"\n)]\nfn f() {}',
  ],
  [
    "comment on next line",
    "#[allow(dead_code)]\n// used only by the generated bindings in build.rs\nfn f() {}",
  ],
];

for (const [name, text] of reasoned) {
  test(`reasoned suppression passes: ${name}`, () => {
    assert.deepEqual(bare(text), []);
  });
}

const unreasoned: ReadonlyArray<readonly [string, string, string]> = [
  ["rust allow", "#[allow(dead_code)]\nfn f() {}", "#[allow("],
  ["rust inner allow", "#![allow(clippy::pedantic)]\n", "#![allow("],
  ["rust expect", "#[expect(unused)]\nfn f() {}", "#[expect("],
  ["biome no reason", "// biome-ignore lint/x\nlet y = 1;", "biome-ignore"],
  ["biome short reason", "// biome-ignore lint/x: because\nlet y = 1;", "biome-ignore"],
  ["eslint bare", "// eslint-disable-next-line\nfoo();", "eslint-disable"],
  ["eslint block", "/* eslint-disable */\nfoo();", "eslint-disable"],
  ["ts-ignore bare", "// @ts-ignore\nfoo();", "@ts-ignore"],
  ["ts-expect-error short", "// @ts-expect-error: todo\nfoo();", "@ts-expect-error"],
  ["ts-nocheck bare", "// @ts-nocheck\n", "@ts-nocheck"],
];

for (const [name, text, marker] of unreasoned) {
  test(`unreasoned suppression is found: ${name}`, () => {
    assert.deepEqual(bare(text), [marker]);
  });
}

test("a trailing comment under 15 characters is not a rationale", () => {
  assert.deepEqual(bare("#[allow(dead_code)] // unused\nfn f() {}"), ["#[allow("]);
});

test("a next-line code line is not a rationale", () => {
  assert.deepEqual(bare("// @ts-ignore\nconst a = 'a long string literal here';"), ["@ts-ignore"]);
});

test("suppressions already present before the edit are not reported", () => {
  const before = "#[allow(dead_code)]\nfn f() {}\n";
  assert.deepEqual(bare(`${before}fn g() {}\n`, before), []);
});

test("a newly added copy of an existing bare suppression is reported", () => {
  const before = "#[allow(dead_code)]\nfn f() {}\n";
  assert.deepEqual(bare(`${before}#[allow(dead_code)]\nfn g() {}\n`, before), ["#[allow("]);
});

test("text without suppressions yields nothing", () => {
  assert.deepEqual(bare('fn main() { println!("hi"); }\n'), []);
});

test("reports the 1-based line of each finding", () => {
  const found = findUnreasonedSuppressions("", "a\nb\n// @ts-ignore\nc\n");
  assert.deepEqual(
    found.map((s) => s.line),
    [3],
  );
});

test("a multi-line allow without a reason is still found", () => {
  assert.deepEqual(
    bare("#[allow(\n    clippy::too_many_arguments,\n    dead_code\n)]\nfn f() {}"),
    ["#[allow("],
  );
});
