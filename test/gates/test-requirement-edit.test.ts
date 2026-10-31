import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { JsonObject, ToolCall } from "@earendil-works/pi-ai";
import {
  createBashToolDefinition,
  createEditToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import type { SliceRef } from "../../src/core/types.ts";
import { offlineSession } from "../harness/offline-session.ts";

const obsolete = 'test("prints_hello_world", () => assert.equal(run().status, 0));\n';
const replacement = `test("redirected_invocation_refuses_interactive_output", () => {
  const result = run();
  assert.notEqual(result.status, 0, "a redirected shell must refuse to start");
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.length > 0);
  assert.doesNotMatch(result.stderr, /\\x1b/);
});
`;
const before = `import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
const run = () => spawnSync(process.execPath, ["app.cjs"], { encoding: "utf8" });
${obsolete}${replacement}`;
const call = (id: string, name: string, args: JsonObject): ToolCall => ({
  type: "toolCall",
  id,
  name,
  arguments: args,
});
const departure = {
  gate: "tests.weaken",
  scope: "slice",
  chosen: "Remove only prints_hello_world in test/cli.test.mjs",
  why: "Owner approved replacing hello world with a fullscreen interactive shell. Redirected invocations must fail without stdout or terminal escapes, with a stderr diagnostic. Preserve redirected_invocation_refuses_interactive_output and all unrelated coverage.",
  costIfWrong: "Required CLI coverage would be lost",
};
const answers = {
  weakens: { type: "bool", probability: 0.04 },
  motive: {
    type: "choice",
    choice: "requirement-change",
    confidence: 0.85,
    probabilities: {
      "requirement-change": 0.9,
      "test-correction": 0.025,
      "gate-gaming": 0.025,
      refactor: 0.025,
      unclear: 0.025,
    },
  },
};

test("normal SDK edit receives the scoped owner decision and actual RED before retiring obsolete coverage", {
  timeout: 15000,
}, async (t) => {
  let assessed = 0;
  let fixtureRoot = "";
  const host = await offlineSession(
    t,
    (pi) => {
      const { state } = createDevelopmentSystem(pi);
      pi.registerTool(createBashToolDefinition(fixtureRoot));
      pi.registerTool(createEditToolDefinition(fixtureRoot));
      pi.on("session_start", (_event, ctx) => {
        state.update((s) => ({ ...s, phase: "implementing", activeSlice: "shell" as SliceRef }));
        ctx.modelRegistry.classify = async () =>
          Promise.reject(new Error("Offline classifier fixture"));
        // Only provider I/O is substituted; production holder, cascade, guards and tools run.
        ctx.modelRegistry.complete = async (model, context) => {
          const message = context.messages[0];
          assert.ok(message?.role === "user" && typeof message.content === "string");
          const request = JSON.parse(message.content);
          if (request.questions.weakens !== undefined) assessed++;
          const evidence = request.state;
          const sufficient =
            JSON.stringify(evidence).includes("Owner approved replacing hello world") &&
            String(evidence.recentFailure).includes("a redirected shell must refuse to start");
          return {
            role: "assistant",
            api: model.api,
            provider: model.provider,
            model: model.id,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  sufficient
                    ? {
                        status: "resolved",
                        reason:
                          "Only obsolete characterization is removed; replacement RED and owner decision are in evidence",
                        answers,
                      }
                    : {
                        status: "unresolved",
                        reason: "Missing owner contract or actual redirected invocation failure",
                      },
                ),
              },
            ],
            stopReason: "stop",
            timestamp: 0,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          };
        };
      });
    },
    (_context, request) => {
      if (request === 0) return [call("record", "devsys_record_departure", departure)];
      if (request === 1)
        return [
          call("red", "bash", {
            command:
              "unset NODE_TEST_CONTEXT; node --test --test-name-pattern=redirected_invocation_refuses_interactive_output test/cli.test.mjs",
          }),
        ];
      if (request === 2)
        return [
          call("edit", "edit", {
            path: "test/cli.test.mjs",
            edits: [{ oldText: obsolete, newText: "" }],
          }),
        ];
      return [];
    },
    (root) => {
      fixtureRoot = root;
      mkdirSync(join(root, "test"));
      writeFileSync(join(root, "app.cjs"), 'console.log("hello world");\n');
      writeFileSync(join(root, "test/cli.test.mjs"), before);
      writeFileSync(
        join(root, ".development-system.toml"),
        '[models]\nadvisor = ["offline-devsys/scripted"]\n',
      );
      return root;
    },
  );
  await host.session.prompt(
    "Replace only the obsolete owner-superseded characterization after RED",
  );
  assert.equal(
    readFileSync(join(host.root, "test/cli.test.mjs"), "utf8"),
    before.replace(obsolete, ""),
    JSON.stringify(host.session.state.messages.filter((m) => m.role === "toolResult")),
  );
  const red = host.session.state.messages.find(
    (m) => m.role === "toolResult" && m.toolCallId === "red",
  );
  assert.ok(red?.role === "toolResult" && red.isError);
  assert.match(JSON.stringify(red.content), /a redirected shell must refuse to start/);
  assert.doesNotMatch(JSON.stringify(red.content), /skipping running files/);
  assert.equal(
    assessed,
    1,
    JSON.stringify(host.session.state.messages.filter((m) => m.role === "toolResult")),
  );
  assert.deepEqual(host.errors, []);
});

type Scenario =
  | "gaming"
  | "delete-required"
  | "stale-slice"
  | "once"
  | "missing-red"
  | "unresolved"
  | "unresolved-deletion"
  | "json"
  | "schema"
  | "answers"
  | "confidence"
  | "provider"
  | "distribution";

function assessmentReply(scenario: Scenario, evidence: JsonObject): string {
  const resolved = (value: unknown) =>
    JSON.stringify({ status: "resolved", reason: "Assessed exact edit", answers: value });
  switch (scenario) {
    case "provider":
      throw new Error("provider details must not escape");
    case "json":
      return "not JSON";
    case "schema":
      return JSON.stringify({ status: "resolved", answers });
    case "answers":
      return resolved({});
    case "confidence":
      return resolved({ ...answers, motive: { ...answers.motive, confidence: 0.4 } });
    case "distribution":
      return resolved({ ...answers, motive: { ...answers.motive, probabilities: {} } });
    case "unresolved-deletion":
    case "unresolved":
      return JSON.stringify({ status: "unresolved", reason: "Need the owner contract" });
    case "gaming":
    case "delete-required":
      return resolved({
        weakens: { type: "bool", probability: 0.99 },
        motive: {
          type: "choice",
          choice: "gate-gaming",
          confidence: 0.98,
          probabilities: {
            "requirement-change": 0.005,
            "test-correction": 0.005,
            "gate-gaming": 0.98,
            refactor: 0.005,
            unclear: 0.005,
          },
        },
      });
    default:
      return String(evidence.departures).includes(departure.why) &&
        String(evidence.recentFailure).includes("a redirected shell must refuse to start")
        ? resolved(answers)
        : JSON.stringify({
            status: "unresolved",
            reason: "Missing applicable owner contract or actual RED",
          });
  }
}

for (const scenario of [
  "gaming",
  "delete-required",
  "stale-slice",
  "once",
  "missing-red",
  "unresolved",
  "unresolved-deletion",
  "json",
  "schema",
  "answers",
  "confidence",
  "provider",
  "distribution",
] as const) {
  test(`normal SDK edit rejects ${scenario} without changing the rejected target`, {
    timeout: 15000,
  }, async (t) => {
    let root = "";
    const seen: JsonObject[] = [];
    let openOnceAfterEdit = 0;
    const host = await offlineSession(
      t,
      (pi) => {
        pi.on("session_start", (_event, ctx) => {
          ctx.modelRegistry.classify = async () =>
            Promise.reject(new Error("Offline classifier fixture"));
        });
        const { state } = createDevelopmentSystem(pi);
        pi.on("agent_end", () => {
          openOnceAfterEdit = state
            .get()
            .openDepartures.filter((d) => d.scope.kind === "once").length;
        });
        pi.registerTool(createBashToolDefinition(root));
        pi.registerTool(createEditToolDefinition(root));
        pi.on("session_start", (_event, ctx) => {
          state.update((s) => ({ ...s, phase: "implementing", activeSlice: "shell" as SliceRef }));
          ctx.modelRegistry.complete = async (model, context) => {
            const message = context.messages[0];
            assert.ok(message?.role === "user" && typeof message.content === "string");
            const request = JSON.parse(message.content);
            const evidence = request.state;
            let text = JSON.stringify({ status: "unresolved", reason: "Not a test assessment" });
            if (request.questions.weakens !== undefined) {
              seen.push(evidence);
              text = assessmentReply(scenario, evidence);
            }
            return {
              role: "assistant",
              api: model.api,
              provider: model.provider,
              model: model.id,
              content: [{ type: "text", text }],
              stopReason: "stop",
              timestamp: 0,
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            };
          };
        });
        pi.on("tool_result", (event) => {
          if (event.toolCallId === "edit") {
            openOnceAfterEdit = state
              .get()
              .openDepartures.filter((d) => d.scope.kind === "once").length;
          }
          if (event.toolCallId === "record" && scenario === "stale-slice") {
            state.update((s) => ({ ...s, activeSlice: "unrelated" as SliceRef }));
          }
        });
      },
      (_context, request) => {
        if (request === 0)
          return [
            call("record", "devsys_record_departure", {
              ...departure,
              scope: scenario === "once" || scenario === "unresolved-deletion" ? "once" : "slice",
            }),
          ];
        if (request === 1 && scenario !== "missing-red")
          return [
            call("red", "bash", {
              command:
                "unset NODE_TEST_CONTEXT; node --test --test-name-pattern=redirected_invocation_refuses_interactive_output test/cli.test.mjs",
            }),
          ];
        if (request === 1)
          return [
            call("edit", "edit", {
              path: "test/cli.test.mjs",
              edits: [{ oldText: obsolete, newText: "" }],
            }),
          ];
        let oldText = obsolete;
        if (scenario === "gaming") oldText = 'assert.equal(result.stdout, "");';
        if (scenario === "delete-required" || scenario === "unresolved-deletion") oldText = before;
        if (request === 2)
          return [
            call("edit", "edit", { path: "test/cli.test.mjs", edits: [{ oldText, newText: "" }] }),
          ];
        if (request === 3 && scenario === "once")
          return [
            call("changed-edit", "edit", {
              path: "test/cli.test.mjs",
              edits: [{ oldText: 'assert.equal(result.stdout, "");', newText: "assert.ok(true);" }],
            }),
          ];
        return [];
      },
      (directory) => {
        root = directory;
        mkdirSync(join(root, "test"));
        writeFileSync(join(root, "app.cjs"), 'console.log("hello world");\n');
        writeFileSync(join(root, "test/cli.test.mjs"), before);
        writeFileSync(
          join(root, ".development-system.toml"),
          '[models]\nadvisor = ["offline-devsys/scripted"]\n',
        );
        return root;
      },
    );
    await host.session.prompt(
      "Exercise the normal edit gate against the exact decision, failure and proposed edit",
    );
    const results = host.session.state.messages.filter((m) => m.role === "toolResult");
    const lastEdit = results.find(
      (m) =>
        m.role === "toolResult" && m.toolCallId === (scenario === "once" ? "changed-edit" : "edit"),
    );
    assert.ok(lastEdit?.role === "toolResult" && lastEdit.isError, JSON.stringify(results));
    const text = JSON.stringify(lastEdit.content);
    const expected = scenario === "once" ? before.replace(obsolete, "") : before;
    assert.equal(readFileSync(join(root, "test/cli.test.mjs"), "utf8"), expected);
    if (scenario === "gaming" || scenario === "delete-required")
      assert.match(text, /hard stop tests.weaken/);
    else {
      assert.match(text, /tests.weaken assessment.*reasoning\./);
      assert.doesNotMatch(
        text,
        /requires user approval|devsys_request_approval|provider details must not escape/,
      );
    }
    if (scenario === "unresolved-deletion") assert.equal(openOnceAfterEdit, 1);
    if (scenario === "stale-slice") assert.equal(seen[0]?.departures, "[]");
    if (scenario === "once") {
      assert.equal(seen.length, 2);
      assert.match(String(seen[0]?.departures), /Owner approved/);
      assert.equal(seen[1]?.departures, "[]");
      assert.notEqual(seen[0]?.after, seen[1]?.after);
    }
    const stage: Partial<Record<Scenario, RegExp>> = {
      unresolved: /reasoning.evidence.*Need the owner contract/,
      "unresolved-deletion": /reasoning.evidence.*Need the owner contract/,
      json: /reasoning.json/,
      schema: /reasoning.schema/,
      answers: /reasoning.answers.*missing/,
      confidence: /reasoning.answers.*low confidence/,
      distribution: /reasoning.answers.*distribution/,
      provider: /reasoning.provider/,
    };
    if (stage[scenario] !== undefined) assert.match(text, stage[scenario]);
    assert.deepEqual(host.errors, []);
  });
}
