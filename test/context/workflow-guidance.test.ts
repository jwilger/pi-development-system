import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path, { join } from "node:path";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { createDriverFactory } from "../../src/subagents/orch/runtime.ts";
import type { AgentDriver, DriverOptions } from "../../src/subagents/types.ts";
import { offlineSession } from "../harness/offline-session.ts";

const workflow = "Queue choice belongs to the owner. Assign only after explicit approval.";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

function configure(root: string, content = workflow) {
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs/workflow.md"), content);
  writeFileSync(
    join(root, ".development-system.toml"),
    '[workflow]\nguidance = ["docs/workflow.md"]\n',
  );
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "add", "docs/workflow.md"]);
}

test("an independent fresh child receives configured tracked workflow content and source identity", async (t) => {
  let child: AgentDriver | undefined;
  let restore: (() => Promise<AgentDriver>) | undefined;
  const requests: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      let rootContext: ExtensionContext | undefined;
      pi.on("session_start", (_event, ctx) => {
        rootContext = ctx;
      });
      pi.registerTool({
        name: "prepare_child",
        label: "Prepare child",
        description: "Prepare independent fixture child",
        parameters: Type.Object({}),
        async execute() {
          assert.ok(rootContext);
          const factory = createDriverFactory(
            () => {
              assert.ok(rootContext);
              return rootContext;
            },
            () => "use-current",
          );
          const options: DriverOptions = {
            path: "/independent-workflow",
            parentPath: null,
            type: {
              name: "fixture",
              description: "Fixture",
              systemPrompt: "Perform the task.",
              tools: { allow: [] },
              spawnOverrides: { model: "offline-devsys/pinned", thinkingLevel: "off" },
            },
            inherited: [],
            tools: [],
            signal: new AbortController().signal,
            shouldPause: () => false,
            onEvent: () => undefined,
          };
          child = await factory(options);
          restore = () => {
            assert.ok(child);
            return factory({
              ...options,
              sessionFile: child.sessionFile,
              sessionLeafId: child.sessionLeafId ?? null,
            });
          };
          return { content: [{ type: "text", text: "prepared" }], details: undefined };
        },
      });
    },
    (context, request) => {
      requests.push(JSON.stringify(context));
      return request === 0
        ? [{ type: "toolCall", id: "prepare", name: "prepare_child", arguments: {} }]
        : [];
    },
  );
  t.after(() => child?.dispose());
  configure(host.root);
  await host.session.prompt("Prepare the independent child.");
  assert.ok(child, JSON.stringify(host.errors));
  await child.prompt("Choose the next work item.");
  const actual = requests.at(-1) ?? "";
  assert.ok(actual.includes(workflow), "independent request must contain local workflow content");
  assert.ok(actual.includes("docs/workflow.md"));
  assert.ok(actual.includes(hash(workflow)));
  const changed = "The owner changed the repository workflow.";
  writeFileSync(join(host.root, "docs/workflow.md"), changed);
  assert.ok(restore);
  child.dispose();
  child = await restore();
  await child.prompt("Resume using the current workflow.");
  assert.ok(requests.at(-1)?.includes(changed));
  assert.ok(requests.at(-1)?.includes(hash(changed)));
  writeFileSync(
    join(host.root, ".development-system.toml"),
    '[workflow]\nguidance = ["missing.md"]\n',
  );
  const beforeInvalid = requests.length;
  await assert.rejects(
    child.prompt("Resume with invalid configuration."),
    /guidance-error.*Repair/,
  );
  assert.equal(requests.length, beforeInvalid);
  assert.deepEqual(host.errors, []);
});

test("root requests receive configured workflow content", async (t) => {
  const requests: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return [];
    },
  );
  configure(host.root);
  await host.session.prompt("Describe the repository workflow.");
  assert.ok(requests.at(-1)?.includes(workflow), "root request must include configured workflow");
  assert.ok(requests.at(-1)?.includes(hash(workflow)));
  writeFileSync(join(host.root, "docs/workflow.md"), "New owner-reviewed local workflow.");
  await host.session.prompt("Use the updated workflow.");
  assert.ok(requests.at(-1)?.includes("New owner-reviewed local workflow."));
  assert.ok(requests.at(-1)?.includes(hash("New owner-reviewed local workflow.")));
  assert.deepEqual(host.errors, []);
});

test("tracked nested guidance reaches requests with Windows native path separators", async (t) => {
  const requests: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return [];
    },
  );
  configure(host.root);
  const nativeRelative = path.relative;
  const nativeSeparator = path.sep;
  t.mock.method(path, "relative", (from: string, to: string) =>
    nativeRelative(from, to).split(nativeSeparator).join("\\"),
  );
  Object.defineProperty(path, "sep", { value: "\\" });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    Object.defineProperty(path, "sep", { value: nativeSeparator });
    syncBuiltinESMExports();
  });
  await host.session.prompt("Use the repository workflow on Windows.");
  assert.ok(
    requests.at(-1)?.includes(workflow),
    "Git paths and native paths must identify the same tracked file",
  );
  assert.deepEqual(host.errors, []);
});

test("a concurrent symlink replacement cannot include private outside content", async (t) => {
  const requests: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return [];
    },
  );
  configure(host.root);
  const target = join(host.root, "docs/workflow.md");
  const privateFile = `${host.root}-private.txt`;
  writeFileSync(privateFile, "PRIVATE OUTSIDE FIXTURE CONTENT");
  t.after(() => unlinkSync(privateFile));
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const bin = join(host.root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const cp = require("node:child_process");
if (process.argv.includes("ls-files")) {
  const counter = ${JSON.stringify(join(bin, "reads"))};
  const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) + 1 : 1;
  fs.writeFileSync(counter, String(count));
  if (count === 2) {
    fs.unlinkSync(${JSON.stringify(target)});
    fs.symlinkSync(${JSON.stringify(privateFile)}, ${JSON.stringify(target)});
  }
}
const result = cp.spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), {stdio: "inherit"});
process.exit(result.status ?? 1);
`,
    { mode: 0o755 },
  );
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  t.after(() => {
    process.env.PATH = oldPath;
  });
  await host.session.prompt("Read the workflow after a concurrent filesystem edit.");
  assert.equal(requests.length, 0, "outside content must never reach the provider");
  assert.match(JSON.stringify(host.errors), /guidance-error.*Repair/);
});

test("unchanged third continuation retains a stable workflow section position", async (t) => {
  const requests: unknown[][] = [];
  const updated = "Owner changed policy in the first tool call.";
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
      pi.registerTool({
        name: "fixture_tool",
        label: "Fixture",
        description: "Fixture owner edit",
        parameters: Type.Object({}),
        async execute() {
          writeFileSync(join(host.root, "docs/workflow.md"), updated);
          return { content: [{ type: "text", text: "done" }], details: undefined };
        },
      });
    },
    (context, index) => {
      requests.push(context.messages);
      return index < 2
        ? [{ type: "toolCall", id: `tool-${index}`, name: "fixture_tool", arguments: {} }]
        : [];
    },
  );
  configure(host.root);
  await host.session.prompt("Run the fixture tool twice.");
  assert.equal(requests.length, 3);
  const second = requests[1] ?? [];
  assert.deepEqual(
    requests[2]?.slice(0, second.length),
    second,
    "unchanged guidance must preserve the previous request as a transcript prefix",
  );
  assert.ok(JSON.stringify(requests[2]).includes(hash(updated)));
  assert.deepEqual(host.errors, []);
});

test("configured guidance refuses conflicting full-prompt overrides before dispatch", async (t) => {
  let requests = 0;
  let removeOverride: (() => void) | undefined;
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
      removeOverride = pi.on("before_agent_start", (event) => ({
        systemPrompt: event.systemPrompt,
      }));
    },
    () => {
      requests++;
      return [];
    },
  );
  configure(host.root);
  await host.session.prompt("Use a full-prompt override.");
  assert.equal(requests, 0, "a forced prompt must not bypass guidance refresh");
  assert.match(JSON.stringify(host.errors), /guidance-error.*forced.*Repair/);
  assert.ok(removeOverride);
  removeOverride();
  await host.session.prompt("Retry after removing the conflicting override.");
  assert.equal(requests, 1);
});

test("operational Git root discovery failures refuse nested preparation", async (t) => {
  let requests = 0;
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    () => {
      requests++;
      return [];
    },
    (root) => {
      const cwd = join(root, "apps", "nested");
      mkdirSync(cwd, { recursive: true });
      return cwd;
    },
  );
  configure(host.root);
  const bin = join(host.root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    '#!/bin/sh\necho "fatal: detected dubious ownership in repository" >&2\nexit 128\n',
    { mode: 0o755 },
  );
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  t.after(() => {
    process.env.PATH = oldPath;
  });
  await host.session.prompt("Use workflow from the nested app.");
  assert.equal(requests, 0);
  assert.match(JSON.stringify(host.errors), /guidance-error.*dubious ownership.*Repair/s);
});

test("unconfigured non-Git sessions remain usable", async (t) => {
  let requests = 0;
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    () => {
      requests++;
      return [];
    },
  );
  await host.session.prompt("Work without a repository.");
  assert.equal(requests, 1);
  assert.deepEqual(host.errors, []);
});

test("workflow transport preserves trailing whitespace in a repository root", async (t) => {
  let repo = "";
  const requests: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return [];
    },
    (root) => {
      repo = join(root, "repository with trailing space ");
      mkdirSync(repo);
      return repo;
    },
  );
  configure(repo);
  await host.session.prompt("Use the workflow in this repository.");
  assert.ok(requests.at(-1)?.includes(workflow));
  assert.ok(requests.at(-1)?.includes(hash(workflow)));
  assert.deepEqual(host.errors, []);
});

test("repository root guidance is found from a nested working directory", async (t) => {
  const requests: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return [];
    },
    (root) => {
      const cwd = join(root, "apps", "nested");
      mkdirSync(cwd, { recursive: true });
      return cwd;
    },
  );
  configure(host.root);
  await host.session.prompt("Use repository workflow from the nested app.");
  assert.ok(requests.at(-1)?.includes(workflow));
  assert.deepEqual(host.errors, []);
});

for (const mode of ["change", "delete"] as const) {
  test(`automatic tool continuation revalidates guidance after ${mode}`, async (t) => {
    const requests: string[] = [];
    const updated = "An owner changed this workflow while a tool ran.";
    const host = await offlineSession(
      t,
      (pi) => {
        createDevelopmentSystem(pi);
        pi.registerTool({
          name: "edit_fixture",
          label: "Edit fixture",
          description: "Simulate concurrent owner edit",
          parameters: Type.Object({}),
          async execute() {
            if (mode === "change") writeFileSync(join(host.root, "docs/workflow.md"), updated);
            else unlinkSync(join(host.root, "docs/workflow.md"));
            return {
              content: [{ type: "text", text: "owner edit completed" }],
              details: undefined,
            };
          },
        });
      },
      (context, index) => {
        requests.push(JSON.stringify(context));
        return index === 0
          ? [{ type: "toolCall", id: "edit", name: "edit_fixture", arguments: {} }]
          : [];
      },
    );
    configure(host.root);
    await host.session.prompt("Run the fixture edit then follow the current workflow.");
    if (mode === "change") {
      assert.equal(requests.length, 2);
      assert.ok(requests[1]?.includes(updated));
      assert.ok(requests[1]?.includes(hash(updated)));
      assert.deepEqual(host.errors, []);
    } else {
      assert.equal(
        requests.length,
        1,
        "invalid guidance must stop automatic continuation dispatch",
      );
      assert.match(JSON.stringify(host.errors), /guidance-error.*Repair/);
    }
  });
}

test("invalid configured guidance refuses a root request before model dispatch", async (t) => {
  let requests = 0;
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
    },
    () => {
      requests++;
      return [];
    },
  );
  configure(host.root);
  writeFileSync(
    join(host.root, ".development-system.toml"),
    '[workflow]\nguidance = ["missing.md"]\n',
  );
  await host.session.prompt("Execute local workflow.");
  assert.equal(requests, 0);
  assert.match(JSON.stringify(host.errors), /guidance-error.*Repair/);
  configure(host.root);
  await host.session.prompt("Retry after the owner repaired the workflow configuration.");
  assert.equal(requests, 1, "a repaired configuration permits a fresh request");
});

const invalidCases = [
  {
    name: "untracked file",
    prepare(root: string) {
      writeFileSync(join(root, "docs/untracked.md"), workflow);
      return '[workflow]\nguidance = ["docs/untracked.md"]';
    },
    error: /untracked/,
  },
  {
    name: "parent escape",
    prepare() {
      return '[workflow]\nguidance = ["../outside.md"]';
    },
    error: /contained path/,
  },
  {
    name: "absolute path",
    prepare(root: string) {
      return `[workflow]\nguidance = [${JSON.stringify(join(root, "docs/workflow.md"))}]`;
    },
    error: /contained path/,
  },
  {
    name: "directory",
    prepare() {
      return '[workflow]\nguidance = ["docs"]';
    },
    error: /regular file/,
  },
  {
    name: "symlink escape",
    prepare(root: string) {
      unlinkSync(join(root, "docs/workflow.md"));
      symlinkSync("/etc/hosts", join(root, "docs/workflow.md"));
      return undefined;
    },
    error: /escapes/,
  },
  {
    name: "invalid UTF-8",
    prepare(root: string) {
      writeFileSync(join(root, "docs/workflow.md"), Buffer.from([0xff]));
      return undefined;
    },
    error: /UTF-8/,
  },
  {
    name: "per-file budget",
    prepare(root: string) {
      writeFileSync(join(root, "docs/workflow.md"), "x".repeat(32769));
      return undefined;
    },
    error: /32 KiB/,
  },
  {
    name: "combined budget",
    prepare(root: string) {
      for (const name of ["one", "two", "three"]) {
        writeFileSync(join(root, `docs/${name}.md`), "x".repeat(22000));
      }
      execFileSync("git", ["-C", root, "add", "docs"]);
      return '[workflow]\nguidance = ["docs/one.md", "docs/two.md", "docs/three.md"]';
    },
    error: /64 KiB/,
  },
  {
    name: "non-array config",
    prepare() {
      return '[workflow]\nguidance = "docs/workflow.md"';
    },
    error: /array/,
  },
  {
    name: "empty config path",
    prepare() {
      return '[workflow]\nguidance = [""]';
    },
    error: /non-empty/,
  },
  {
    name: "unknown config key",
    prepare() {
      return "[workflow]\nunknown = []";
    },
    error: /unknown key/,
  },
];

for (const scenario of invalidCases) {
  test(`preparation refuses ${scenario.name} without calling the model`, async (t) => {
    let requests = 0;
    const host = await offlineSession(
      t,
      (pi) => {
        createDevelopmentSystem(pi);
      },
      () => {
        requests++;
        return [];
      },
    );
    configure(host.root);
    const config = scenario.prepare(host.root);
    if (config !== undefined) writeFileSync(join(host.root, ".development-system.toml"), config);
    await host.session.prompt("Use the repository workflow.");
    assert.equal(requests, 0);
    const errors = JSON.stringify(host.errors);
    assert.match(errors, /guidance-error/);
    assert.match(errors, scenario.error);
    assert.match(errors, /Repair/);
  });
}
