import assert from "node:assert/strict";
import test from "node:test";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { judgeBump } from "../../scripts/lib/jev.ts";

test("release classification sends commit rationale alongside, not instead of, the diff", async (t) => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "offline-test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  });
  const diff = "diff --git a/src/api.ts b/src/api.ts\n-export const oldTool = true;\n";
  const message = "fix(api)!: retire old tool\n\nBREAKING CHANGE: use the replacement tool.";
  let sent: unknown;
  t.mock.method(TypeSafeClient.prototype, "systemOne", async (request: unknown) => {
    sent = request;
    return {
      answers: {
        breaking: { noul: 0.95 },
        feature: { noul: 0.05 },
        observable: { noul: 0.99 },
      },
    };
  });
  const judgment = await judgeBump({
    packageName: "example",
    baseVersion: "2.0.0",
    changedFiles: ["src/api.ts"],
    diff,
    ...{ commitMessages: [message] },
  });
  assert.equal(judgment.bump, "major");
  assert.ok(sent && typeof sent === "object" && "state" in sent);
  const state = sent.state;
  assert.ok(state && typeof state === "object");
  assert.ok("commit_messages" in state);
  assert.equal(state.commit_messages, message);
  assert.ok("diff" in state);
  assert.equal(state.diff, diff);
});

test("commit evidence is redacted and bounded before leaving the process", async (t) => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "offline-test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  });
  let sent: unknown;
  t.mock.method(TypeSafeClient.prototype, "systemOne", async (request: unknown) => {
    sent = request;
    return {
      answers: { breaking: { noul: 0.01 }, feature: { noul: 0.01 }, observable: { noul: 0.01 } },
    };
  });
  const token = `ghp_${"x".repeat(30)}`;
  await judgeBump({
    packageName: "example",
    baseVersion: "2.0.0",
    changedFiles: ["README.md"],
    diff: "unchanged",
    commitMessages: [`fix: do not leak ${token}\n${"rationale ".repeat(2000)}`],
  });
  assert.ok(sent && typeof sent === "object" && "state" in sent);
  const state = sent.state;
  assert.ok(state && typeof state === "object" && "commit_messages" in state);
  assert.equal(typeof state.commit_messages, "string");
  if (typeof state.commit_messages !== "string") throw new Error("unreachable after assertion");
  assert.ok(!state.commit_messages.includes(token));
  assert.match(state.commit_messages, /\[redacted\]/);
  assert.match(state.commit_messages, /\[truncated\]$/);
  assert.ok(state.commit_messages.length <= 12_020);
});
