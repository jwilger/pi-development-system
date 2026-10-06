import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import type { Exec } from "../../src/core/exec.ts";
import { err, ok } from "../../src/core/result.ts";
import { createApprovalStore } from "../../src/gates/approvals.ts";
import { registerPushGuard } from "../../src/gates/push-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");

const offlineJev: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};
const jevRelated = (probability: number): Jev => ({
  ask: async () =>
    ok({ related: { type: "bool", probability } } satisfies Record<string, ClassifierAnswer>),
  availability: () => "online",
  model: () => "fake/jev",
});

type World = {
  mode?: string;
  ci?: "success" | "failure" | "in_progress";
  branch?: string;
  lastCommit?: string;
  hasUI?: boolean;
  jev?: Jev;
  noFailureLog?: boolean;
};

const setup = (world: World = {}) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-push-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version = 1\n\n[delivery]\nmode = "${world.mode ?? "trunk"}"\n`,
  );
  const fake = createFakePi({ hasUI: world.hasUI ?? false, cwd });
  const state = createSessionState(fake.api);
  const approvals = createApprovalStore(fake.api);
  const exec: Exec = async (command, args) => {
    const line = [command, ...args].join(" ");
    const out = (stdout: string) => ({ code: 0, stdout, stderr: "" });
    if (line.startsWith("gh run list")) {
      const ci = world.ci ?? "success";
      return out(
        JSON.stringify([
          {
            status: ci === "in_progress" ? "in_progress" : "completed",
            conclusion: ci === "in_progress" ? "" : ci,
            headSha: "abcdef1234",
            databaseId: 99,
          },
        ]),
      );
    }
    if (line.startsWith("gh run view") && world.noFailureLog) {
      return { code: 1, stdout: "", stderr: "no log" };
    }
    if (line.startsWith("gh run view")) return out("FAIL src/a.test.ts: expected 1 got 2");
    if (line.startsWith("git rev-parse")) return out(`${world.branch ?? "main"}\n`);
    if (line.startsWith("git log")) return out(`${world.lastCommit ?? "feat: add a thing"}\n`);
    if (line.startsWith("git diff")) return out("diff --git a/src/a.ts b/src/a.ts\n-1\n+2\n");
    return out("");
  };
  registerPushGuard({
    pi: fake.api,
    state,
    approvals,
    jev: () => world.jev ?? offlineJev,
    exec,
    now,
  });
  const push = (command: string) =>
    fake.emit({
      type: "tool_call",
      toolName: "bash",
      toolCallId: "c1",
      input: { command },
    } as never) as Promise<{ block: boolean; reason: string } | undefined>;
  return { fake, state, push, cwd };
};

test("non-push commands are ignored", async () => {
  const { push } = setup({ ci: "failure" });
  assert.equal(await push("git status"), undefined);
});

test("a push on a green trunk is allowed", async () => {
  const { push } = setup();
  assert.equal(await push("git push origin main"), undefined);
});

test("pending or unknown CI does not block", async () => {
  const { push } = setup({ ci: "in_progress" });
  assert.equal(await push("git push origin main"), undefined);
});

test("local-only blocks every push with a reason naming the setting", async () => {
  const { push } = setup({ mode: "local-only" });
  const r = await push("git push origin feature");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /local-only/);
});

test("pull-request mode hard-stops a push to the trunk but not to a branch", async () => {
  const { push } = setup({ mode: "pull-request" });
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /hard stop push\.delivery-mode/);
  assert.equal(await push("git push origin feature/x"), undefined);
});

test("a bare push resolves the current branch", async () => {
  const onTrunk = setup({ mode: "pull-request", branch: "main" });
  assert.equal((await onTrunk.push("git push"))?.block, true);
  const onFeature = setup({ mode: "pull-request", branch: "feature/x" });
  assert.equal(await onFeature.push("git push"), undefined);
});

test("a red trunk hard-stops an unrelated push", async () => {
  const { push } = setup({ ci: "failure", jev: jevRelated(0.1) });
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /hard stop push\.red-trunk/);
  assert.match(r?.reason ?? "", /Requires user approval/);
});

test("a fix commit Jev reads as related to the failure may push to a red trunk", async () => {
  const { push } = setup({
    ci: "failure",
    lastCommit: "fix(ci): repair the failing test",
    jev: jevRelated(0.9),
  });
  assert.equal(await push("git push origin main"), undefined);
});

test("a fix commit Jev reads as unrelated is still hard-stopped", async () => {
  const { push } = setup({
    ci: "failure",
    lastCommit: "fix: tweak something else",
    jev: jevRelated(0.3),
  });
  assert.equal((await push("git push origin main"))?.block, true);
});

test("a non-fix commit never gets the red-trunk exemption, even if Jev says related", async () => {
  const { push } = setup({ ci: "failure", lastCommit: "feat: shiny", jev: jevRelated(0.95) });
  assert.equal((await push("git push origin main"))?.block, true);
});

test("Jev offline means a red trunk push is hard-stopped", async () => {
  const { push } = setup({ ci: "failure", lastCommit: "fix: x" });
  assert.equal((await push("git push origin main"))?.block, true);
});

test("an approving user can push on a red trunk and the approval is one-shot", async () => {
  const { fake, push } = setup({ ci: "failure", hasUI: true });
  fake.ui.confirmResponses.push(true);
  assert.equal(await push("git push origin main"), undefined);
  fake.ui.confirmResponses.push(false);
  assert.equal((await push("git push origin main"))?.block, true);
});

test("a broken config blocks pushes with the parse message", async () => {
  const { push, cwd } = setup();
  writeFileSync(join(cwd, ".development-system.toml"), "version = 1\n[delivery]\nmode = 3\n");
  const r = await push("git push origin main");
  assert.equal(r?.block, true);
  assert.match(r?.reason ?? "", /delivery policy/);
});

test("a successful push records lastPushAt; a failed push or a non-push does not", async () => {
  const { fake, state } = setup();
  const result = (command: string, isError: boolean) =>
    fake.emit({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "c2",
      input: { command },
      content: [],
      isError,
      details: undefined,
    } as never);
  await result("git push origin main", true);
  await result("git status", false);
  assert.equal(state.get().lastPushAt, undefined);
  await result("git push origin main", false);
  assert.equal(state.get().lastPushAt, "2026-10-06T17:12:00.000Z");
});

test("a fix commit is not exempt when there is no failure log to compare against", async () => {
  const w = setup({
    ci: "failure",
    lastCommit: "fix(ci): repair",
    jev: jevRelated(0.95),
    noFailureLog: true,
  });
  const result = await w.push("git push origin main");
  assert.equal(result?.block, true);
});

test("a push whose directory cannot be resolved is treated as a trunk push in pull-request mode", async () => {
  const w = setup({ mode: "pull-request" });
  const result = await w.push("cd ~/nowhere && git push");
  assert.equal(result?.block, true);
});

test("dry runs and tag-only pushes are not trunk pushes in pull-request mode", async () => {
  const w = setup({ mode: "pull-request" });
  assert.equal(await w.push("git push --dry-run origin main"), undefined);
  assert.equal(await w.push("git push --tags"), undefined);
  assert.equal((await w.push("git push origin HEAD feat"))?.block, true);
});

test("a push with a redirect and no refspec still checks the current branch", async () => {
  const w = setup({ mode: "pull-request" });
  assert.equal((await w.push("git push 2>&1"))?.block, true);
  assert.equal((await w.push("git push >/dev/null 2>&1"))?.block, true);
});
