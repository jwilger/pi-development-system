import assert from "node:assert/strict";
import test from "node:test";
import { classifyGitCommand } from "../../src/core/git-intent.ts";
import { parseShell } from "../../src/core/shell-parse.ts";
import { bashMutations } from "../../src/core/test-weakening.ts";

/** Opens a JS template expression; built here so the literal is not mistaken for a template string. */
const OPEN = "$" + "{";
const HEREDOC = [
  "cat > a.ts <<'EOF'",
  `const s = \`${OPEN}a + b}\`;`,
  `const t = \`${OPEN}x ? 1 : 2}\`;`,
  "EOF",
].join("\n");

test("parseShell never throws on template-literal text", () => {
  assert.doesNotThrow(() => parseShell(HEREDOC));
  assert.doesNotThrow(() => parseShell(`echo ${OPEN}fn(x)}`));
  assert.deepEqual(parseShell("echo hi"), ["echo", "hi"]);
});

test("the test guard's shell reader does not crash on heredocs containing template expressions", () => {
  assert.doesNotThrow(() => bashMutations(HEREDOC));
  assert.deepEqual(bashMutations(`echo ${OPEN}a + b} && rm test/a.test.ts`), [
    { path: "test/a.test.ts", kind: "remove" },
  ]);
});

test("the git guard still classifies commands that contain template expressions", () => {
  assert.equal(classifyGitCommand(HEREDOC), "ordinary");
  assert.notEqual(classifyGitCommand(`echo ${OPEN}a + b} && git push --force`), "ordinary");
});
