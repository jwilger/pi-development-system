import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { err } from "../../src/core/result.ts";
import { reviewGap } from "../../src/core/review-flow.ts";
import type { SliceRef } from "../../src/core/types.ts";
import type { Jev } from "../../src/jev/client.ts";
import { snapshotDiff } from "../../src/review/digest.ts";
import { createReviewRecordTool } from "../../src/review/review-tools.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const exec: Exec = async (command, args, options) => {
  try {
    return {
      code: 0,
      stdout: execFileSync(command, args, { cwd: options?.cwd, encoding: "utf8" }),
      stderr: "",
    };
  } catch (cause) {
    const e = cause as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
};
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd });

test("a nit is reported back, never stored, and leaves the review satisfied", async () => {
  const dir = mkdtempSync(join(tmpdir(), "devsys-followups-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "a.txt"), "one\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  writeFileSync(join(dir, "a.txt"), "one\ntwo\n");

  const fake = createFakePi({ cwd: dir });
  const state = createSessionState(fake.api);
  const slice = "s1" as SliceRef;
  state.update((s) => ({ ...s, activeSlice: slice }));
  const tool = createReviewRecordTool({ state, jev: () => offline, exec });
  const packet = (round: number, finding: string) =>
    `## Review — s1 — round ${round} — lenses: types\n### Sources inspected\n- a.txt:1\n### Findings\n${finding}\n### Verdict\nno-blocking\n`;
  let last = "";
  for (const round of [1, 2, 3]) {
    const before = await snapshotDiff(exec, dir, "HEAD");
    assert.ok(before.ok);
    const r = await tool.execute(
      "c",
      {
        packets: [
          packet(round, round === 3 ? "- [nit] types `a.txt:2` — rename — clearer" : "none"),
        ],
        diffDigest: before.value.digest,
      } as never,
      undefined,
      undefined,
      fake.ctx as never,
    );
    last = r.content.map((c) => ("text" in c ? c.text : "")).join("\n");
    assert.notEqual(r.isError, true, last);
  }
  assert.match(last, /next: done/);
  assert.match(last, /Nits are not stored anywhere/);
  assert.match(last, /nit types `a\.txt:2` — rename/);
  assert.equal(existsSync(join(dir, "docs")), false);
  const now = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(now.ok);
  assert.equal(reviewGap(state.get(), slice, now.value), undefined);
});
