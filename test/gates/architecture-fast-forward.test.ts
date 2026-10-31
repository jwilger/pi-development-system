import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Type } from "typebox";
import { timeoutAsFailure } from "../../src/core/exec.ts";
import { registerArchitectureGuard } from "../../src/gates/architecture-guard.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { offlineSession } from "../harness/offline-session.ts";

for (const [command, diverged, allowed, shadowed] of [
  ["git merge --ff-only origin/main", false, false, true],
  ["git merge --ff-only origin/main", false, true],
  ["git merge --ff-only origin/main", true, false],
  ["git merge --ff-only topic", false, false],
  ["git merge origin/main", false, false],
  ["git merge --ff-only origin/main && git commit -m 'extra'", false, false],
] as const) {
  test(`authoritative integration: ${command}, diverged=${diverged}, shadowed=${shadowed === true}`, async (t) => {
    let executions = 0;
    let target = "";
    const host = await offlineSession(
      t,
      (pi) => {
        const exec = async (
          binary: string,
          args: string[],
          options?: { cwd?: string; timeout?: number },
        ) => timeoutAsFailure(await pi.exec(binary, args, options));
        registerArchitectureGuard({ pi, exec, state: createSessionState(pi) });
        pi.registerTool({
          name: "bash",
          label: "bash",
          description: "Execute fixture integration",
          parameters: Type.Object({ command: Type.String() }),
          async execute(_id, input, _signal, _update, ctx) {
            executions++;
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
          ? [{ type: "toolCall", id: "merge", name: "bash", arguments: { command } }]
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
        writeFileSync(join(root, "initial"), "baseline");
        git("add", ".");
        git("commit", "-m", "test: baseline");
        const base = git("rev-parse", "HEAD");
        writeFileSync(join(root, "incoming"), "approved upstream change");
        git("add", ".");
        git("commit", "-m", "test: upstream");
        target = git("rev-parse", "HEAD");
        git("update-ref", "refs/remotes/origin/main", target);
        git("branch", "topic", target);
        git("switch", "-c", "work", base);
        if (shadowed) git("branch", "origin/main", base);
        if (diverged) {
          writeFileSync(join(root, "local"), "local commit");
          git("add", ".");
          git("commit", "-m", "test: divergence");
        }
        writeFileSync(join(root, "unrelated"), "preserve local work");
        return root;
      },
    );
    await host.session.prompt("Integrate authoritative main without rewriting any history.");
    assert.deepEqual(host.errors, []);
    assert.equal(executions, allowed ? 1 : 0);
    const result = host.session.messages.find(
      (message) => message.role === "toolResult" && message.toolCallId === "merge",
    );
    assert.ok(result?.role === "toolResult");
    assert.equal(result.isError, !allowed);
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: host.root,
      encoding: "utf8",
    }).stdout.trim();
    assert.equal(head === target, allowed);
  });
}
