import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Type } from "typebox";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { timeoutAsFailure } from "../../src/core/exec.ts";
import { registerArchitectureGuard } from "../../src/gates/architecture-guard.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { offlineSession } from "../harness/offline-session.ts";

const commitMessage = "'feat: preserve decision history because records must remain trustworthy'";
const cases = [
  { paired: false, command: `git commit -m ${commitMessage}`, allowed: false, production: false },
  { paired: false, command: `git commit -m ${commitMessage}`, allowed: false, production: true },
  { paired: true, command: `git commit -m ${commitMessage}`, allowed: false },
  { paired: true, command: `git add . && git commit -m ${commitMessage}`, allowed: false },
  { paired: true, command: `git commit -am ${commitMessage}`, allowed: false },
  { paired: true, command: `git -C . commit -m ${commitMessage}`, allowed: false },
  { paired: true, command: "git cherry-pick HEAD", allowed: false },
  { paired: true, command: "git push origin HEAD:main", allowed: false },
  { paired: true, command: "gh pr merge 17 --squash", allowed: false },
];
for (const { paired, command, allowed, production } of cases) {
  test(`pi architecture boundary: ${command}, paired=${paired}, production=${production === true}`, async (t) => {
    let executions = 0;
    let head = "";
    const host = await offlineSession(
      t,
      (pi) => {
        const exec = async (
          binary: string,
          args: string[],
          options?: { cwd?: string; timeout?: number },
        ) => timeoutAsFailure(await pi.exec(binary, args, options));
        if (production) createDevelopmentSystem(pi);
        else registerArchitectureGuard({ pi, exec, state: createSessionState(pi) });
        pi.registerTool({
          name: "bash",
          label: "fixture bash",
          description: "Fixture commit transport",
          parameters: Type.Object({ command: Type.String() }),
          async execute(_id, input, _signal, _update, ctx) {
            executions += 1;
            const result = await exec("sh", ["-c", input.command], { cwd: ctx.cwd });
            return {
              content: [{ type: "text", text: result.stdout + result.stderr }],
              details: undefined,
              isError: result.code !== 0,
            };
          },
        });
      },
      (_context, request) =>
        request === 0
          ? [{ type: "toolCall", id: "commit", name: "bash", arguments: { command } }]
          : [],
      (root) => {
        const git = (...args: string[]) => {
          const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
          assert.equal(result.status, 0, result.stderr);
          return result.stdout.trim();
        };
        git("init", "-b", "main");
        git("config", "user.name", "Fixture");
        git("config", "user.email", "fixture@example.invalid");
        writeFileSync(
          join(root, "ARCHITECTURE.md"),
          "# Architecture\n\nThe boundary protects immutable history.\n",
        );
        git("add", ".");
        git("commit", "-m", "test: establish prospective boundary");
        head = git("rev-parse", "HEAD");
        git("update-ref", "refs/remotes/origin/main", head);
        writeFileSync(
          join(root, ".development-system.toml"),
          `[architecture]\ntrunk_ref = "refs/remotes/origin/main"\nadopted_at = "${head}"\n`,
        );
        mkdirSync(join(root, "docs/adr"), { recursive: true });
        writeFileSync(
          join(root, "docs/adr/0001-history.md"),
          "# History\n\n- **Status:** accepted\n\nPreserve rationale.\n",
        );
        if (paired)
          writeFileSync(
            join(root, "ARCHITECTURE.md"),
            "# Architecture\n\nThe boundary protects immutable history and rejects unpaired decisions.\n",
          );
        git("add", ".");
        return root;
      },
    );
    await host.session.prompt("Commit the staged decision.");
    assert.deepEqual(host.errors, []);
    assert.equal(executions, allowed ? 1 : 0);
    const results = host.session.messages.flatMap((message) =>
      message.role === "toolResult" ? [message] : [],
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isError, !allowed);
    if (production)
      assert.match(JSON.stringify(results[0]?.content), /architecture-update-required/);
    const current = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: host.root,
      encoding: "utf8",
    }).stdout.trim();
    assert.equal(current === head, !allowed);
  });
}
