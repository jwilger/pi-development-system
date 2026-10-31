import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createEditToolDefinition } from "@earendil-works/pi-coding-agent";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { offlineSession } from "../harness/offline-session.ts";

const contract =
  "D40 (approved): Ctrl-K opens the Quit-only menu; typing filters; Enter activates Quit; successful Quit restores input and exits 0. Preserve launch coverage.";
const before = `def wait_for(output, needle):
    assert needle in output

def launch(child):
    wait_for(child.output, "Ferrum")
    child.send(b"\\x03")
    assert child.exit_status == 0
    assert child.input_restored
    assert child.entered_alternate_screen
    assert child.left_alternate_screen
`;
const after = before
  .replace("def wait_for(output, needle):", "def wait_for(output, needle, after=0):")
  .replace(
    '    child.send(b"\\x03")',
    `    if child.scenario == "keyboard":
        child.send(b"\\x0b")
        wait_for(child.output, "Quit")
        child.send(b"qui\\r")
    else:
        child.send(b"\\x03")`,
  );

test("normal edit keeps an unresolved motive closed and directs contract recovery, not owner approval", {
  timeout: 15000,
}, async (t) => {
  let root = "";
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
      pi.registerTool(createEditToolDefinition(root));
      pi.on("session_start", (_event, ctx) => {
        ctx.modelRegistry.classify = async () => Promise.reject(new Error("Offline fixture"));
        ctx.modelRegistry.complete = async (model, context) => {
          const message = context.messages[0];
          assert.ok(message?.role === "user" && typeof message.content === "string");
          const request = JSON.parse(message.content);
          assert.equal(request.state.path, "tests/terminal.py");
          return {
            role: "assistant",
            api: model.api,
            provider: model.provider,
            model: model.id,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "resolved",
                  reason: "Coverage retained, but the author motive is unknown",
                  answers: {
                    weakens: { type: "bool", probability: 0.04 },
                    motive: {
                      type: "choice",
                      choice: "unclear",
                      confidence: 0.9,
                      probabilities: {
                        "requirement-change": 0.025,
                        "test-correction": 0.025,
                        "gate-gaming": 0.025,
                        refactor: 0.025,
                        unclear: 0.9,
                      },
                    },
                  },
                }),
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
    (_context, request) =>
      request === 0
        ? [
            {
              type: "toolCall",
              id: "edit",
              name: "edit",
              arguments: {
                path: "tests/terminal.py",
                edits: [{ oldText: before, newText: after }],
              },
            },
          ]
        : [],
    (workspace) => {
      root = workspace;
      mkdirSync(join(root, "tests"));
      mkdirSync(join(root, "docs"));
      writeFileSync(join(root, "tests/terminal.py"), before);
      writeFileSync(join(root, "docs/decisions.md"), contract);
      writeFileSync(
        join(root, ".development-system.toml"),
        '[models]\nadvisor = ["offline-devsys/scripted"]\n',
      );
      return root;
    },
  );
  await host.session.prompt(
    "Add the approved D40 keyboard acceptance scenario, retaining launch and terminal restoration checks",
  );
  const result = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === "edit",
  );
  assert.ok(result?.role === "toolResult");
  assert.equal(result.isError, true);
  assert.equal(readFileSync(join(root, "tests/terminal.py"), "utf8"), before);
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  assert.match(text, /insufficient-evidence/);
  assert.match(text, /devsys_supply_test_contract/);
  assert.match(text, /motive/);
  assert.match(text, /not.*(?:approval|permission)/i);
  assert.deepEqual(host.errors, []);
});

test("contract evidence recovers an unresolved edit through the same normal gate", {
  timeout: 15000,
}, async (t) => {
  let root = "";
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
      pi.registerTool(createEditToolDefinition(root));
      pi.on("session_start", (_event, ctx) => {
        ctx.modelRegistry.classify = async () => Promise.reject(new Error("Offline fixture"));
        ctx.modelRegistry.complete = async (model, context) => {
          const message = context.messages[0];
          assert.ok(message?.role === "user" && typeof message.content === "string");
          const request = JSON.parse(message.content);
          const supplied = request.state.contractEvidence === contract;
          assert.equal(request.state.path, "tests/terminal.py");
          return {
            role: "assistant",
            api: model.api,
            provider: model.provider,
            model: model.id,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "resolved",
                  reason: "Coverage retained, but the author motive is unknown",
                  answers: {
                    weakens: { type: "bool", probability: 0.04 },
                    motive: {
                      type: "choice",
                      choice: supplied ? "refactor" : "unclear",
                      confidence: 0.9,
                      probabilities: {
                        "requirement-change": 0.025,
                        "test-correction": 0.025,
                        "gate-gaming": 0.025,
                        refactor: supplied ? 0.9 : 0.025,
                        unclear: supplied ? 0.025 : 0.9,
                      },
                    },
                  },
                }),
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
      if (request === 1)
        return [
          {
            type: "toolCall",
            id: "supply",
            name: "devsys_supply_test_contract",
            arguments: {
              path: "tests/terminal.py",
              after,
              contractEvidence: contract,
            },
          },
        ];
      if (request === 0 || request === 2)
        return [
          {
            type: "toolCall",
            id: request === 0 ? "edit" : "retry",
            name: "edit",
            arguments: {
              path: "tests/terminal.py",
              edits: [{ oldText: before, newText: after }],
            },
          },
        ];
      return [];
    },
    (workspace) => {
      root = workspace;
      mkdirSync(join(root, "tests"));
      mkdirSync(join(root, "docs"));
      writeFileSync(join(root, "tests/terminal.py"), before);
      writeFileSync(join(root, "docs/decisions.md"), contract);
      writeFileSync(
        join(root, ".development-system.toml"),
        '[models]\nadvisor = ["offline-devsys/scripted"]\n',
      );
      return root;
    },
  );
  await host.session.prompt(
    "Add the approved D40 keyboard acceptance scenario, retaining launch and terminal restoration checks",
  );
  const result = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === "edit",
  );
  assert.ok(result?.role === "toolResult");
  assert.equal(result.isError, true);
  assert.equal(readFileSync(join(root, "tests/terminal.py"), "utf8"), after);
  const retry = host.session.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === "retry",
  );
  assert.ok(retry?.role === "toolResult");
  assert.equal(retry.isError, false);
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  assert.match(text, /insufficient-evidence/);
  assert.match(text, /devsys_supply_test_contract/);
  assert.match(text, /motive/);
  assert.match(text, /not.*(?:approval|permission)/i);
  assert.deepEqual(host.errors, []);
});
