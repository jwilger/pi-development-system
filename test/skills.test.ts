import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = new URL("../skills/", import.meta.url).pathname;
const MAX_LINES = 200;

const skillFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return skillFiles(path);
    return name === "SKILL.md" ? [path] : [];
  });

const frontmatter = (text: string): Record<string, string> | undefined => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (match?.[1] === undefined) return undefined;
  return Object.fromEntries(
    match[1].split("\n").flatMap((line) => {
      const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
      return kv?.[1] === undefined || kv[2] === undefined ? [] : [[kv[1], kv[2]] as const];
    }),
  );
};

const references = (text: string): string[] => {
  const links = [...text.matchAll(/\]\(([^)#\s]+)\)/g)].map((m) => m[1] ?? "");
  const ticks = [...text.matchAll(/`((?:references|assets|scripts)\/[^`\s]+)`/g)].map(
    (m) => m[1] ?? "",
  );
  return [...links, ...ticks].filter((p) => !/^[a-z]+:/.test(p));
};

const files = skillFiles(ROOT);

test("the repository ships skills", () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  const label = file.slice(ROOT.length);
  const text = readFileSync(file, "utf8");

  test(`${label}: frontmatter has name matching its directory and a description`, () => {
    const fm = frontmatter(text);
    assert.ok(fm, "missing frontmatter");
    assert.equal(fm.name, dirname(file).split("/").at(-1));
    assert.ok(
      (new Map(Object.entries(fm)).get("description") ?? "").length >= 40,
      "description too short to trigger on",
    );
  });

  test(`${label}: stays within ${MAX_LINES} lines`, () => {
    assert.ok(text.split("\n").length <= MAX_LINES);
  });

  test(`${label}: every referenced relative path exists`, () => {
    for (const ref of references(text)) {
      assert.ok(existsSync(join(dirname(file), ref)), `missing ${ref}`);
    }
  });
}

for (const file of files.filter((f) => /\/profile-/.test(f))) {
  test(`${file.slice(ROOT.length)}: description says which files it applies to`, () => {
    const description = frontmatter(readFileSync(file, "utf8"))?.description ?? "";
    assert.match(description, /\.(?:rs|ts|tsx|toml|json)\b/);
  });
}
