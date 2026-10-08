import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createDevelopmentSystem } from "../extensions/development-system.ts";
import { createFakePi } from "./harness/fake-pi.ts";

const DIR = new URL("../prompts/", import.meta.url);

// A prompt template is a shortcut. Each must name at least one registered devsys tool, so the same
// capability can be reached without the slash command (plan rule R12).
// Some tools are registered at session start, once the repo's config and the other extensions are known.
const registered = await (async () => {
  const fake = createFakePi();
  createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  return new Set(fake.tools.keys());
})();

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  test(`${file} names a registered devsys tool, so it has a path that needs no slash command`, () => {
    const text = readFileSync(new URL(file, DIR), "utf8");
    const named = [...text.matchAll(/\bdevsys_[a-z_]+/g)].map((m) => m[0]);
    assert.ok(named.length > 0, "names no devsys_ tool");
    for (const name of named) assert.ok(registered.has(name), `${name} is not a registered tool`);
  });
}
