# Verify script (codemode)

Run every check the project has in one go, in parallel, and get back only what failed.
Paste this into the `codemode` tool. Each nested `bash` call still passes through the
development-system guards, and the test-evidence tracker records each run, so a green result
here is evidence a later "all checks pass" claim can rest on.

Adjust `CHECKS` to the project profile (see the profile skill: TypeScript, Rust, ...).

```js
const CHECKS = [
  { tool: "tsc", command: "npx tsc --noEmit" },
  { tool: "biome", command: "biome check --error-on-warnings ." },
  { tool: "tests", command: "npm test 2>&1 | tail -n 60" },
];

const results = await Promise.all(
  CHECKS.map(async ({ tool, command }) => {
    const r = await tools.bash({ command });
    const lines = r.output.split("\n").filter((l) => l.trim() !== "");
    return {
      tool,
      exit: r.exit_code,
      firstFailures: r.exit_code === 0 ? [] : lines.slice(0, 15),
    };
  }),
);

return results;
```

Read the result before saying anything passed: every `exit` must be `0`. A non-zero `exit`
means fix `firstFailures` first, then run the script again.

Keep to checks that only read: a script may call any tool, and its nested calls are guarded
like direct ones, but a verify script that edits files hides the edit inside one tool call.
