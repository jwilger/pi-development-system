import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("explicit GitHub issue assignment through the public tool", async (t) => {
  const observation = (assignees: string[]) => ({
    data: {
      repository: {
        issue: {
          id: "I_7",
          number: 7,
          url: "https://github.com/o/r/issues/7",
          repository: { nameWithOwner: "o/r" },
          assignees: {
            nodes: assignees.map((login) => ({ login })),
            totalCount: assignees.length,
            pageInfo: { hasNextPage: false },
          },
        },
      },
    },
  });
  type ObservedIssue = ReturnType<typeof observation>["data"]["repository"]["issue"];
  type Reply = Awaited<ReturnType<Exec>>;
  const assignment = { action: "assign", id: "7", operation: "add", assignees: ["alice"] };

  const payload = (result: { content: unknown }) => {
    const content = result.content as { type: string; text: string }[];
    const text = content.find((part) => part.type === "text")?.text;
    assert.ok(text);
    return JSON.parse(text) as {
      kind: string;
      message: string;
      before: string[];
      after: string[] | null;
      ownership: string;
    };
  };

  const assertSafe = (calls: { command: string; args: string[] }[]) => {
    for (const { command, args } of calls) {
      assert.equal(command, "gh");
      if (args[0] === "api") {
        assert.equal(args[1], "graphql");
        assert.match(args[3] ?? "", /^query=query\(/);
        assert.doesNotMatch(args.join(" "), /mutation|Project/);
      } else {
        assert.deepEqual(args.slice(0, 3), ["issue", "edit", "7"]);
        assert.deepEqual(args.slice(-2), ["--repo", "o/r"]);
        for (let i = 3; i < args.length - 2; i += 2)
          assert.match(args[i] ?? "", /^--(?:add|remove)-assignee$/);
      }
    }
  };

  type Scenario = {
    config?: string;
    reply?: (args: string[], output: Reply, call: number) => Reply;
  };

  const setup = (scenario: Scenario = {}) => {
    const cwd = mkdtempSync(join(tmpdir(), "devsys-assignment-"));
    writeFileSync(
      join(cwd, ".development-system.toml"),
      scenario.config ?? 'version = 1\n[tracker]\nkind = "github"\nrepo = "o/r"\n',
    );
    const remote = { assignees: ["bob"], field: "Ready", lifecycle: "OPEN" };
    const calls: { command: string; args: string[] }[] = [];
    const exec: Exec = (command, args, options) => {
      assert.equal(command, "gh");
      assert.equal(options?.cwd, cwd);
      assert.equal(options?.timeout, 30_000);
      calls.push({ command, args });
      const respond = (output: Reply) =>
        Promise.resolve(scenario.reply?.(args, output, calls.length) ?? output);
      if (args[0] === "issue" && args[1] === "edit") {
        remote.field = "Human selected";
        for (let i = 3; i < args.length; i++) {
          if (args[i] === "--add-assignee") remote.assignees.push(args[i + 1] ?? "");
          if (args[i] === "--remove-assignee")
            remote.assignees = remote.assignees.filter((login) => login !== args[i + 1]);
        }
        return respond({ code: 0, stdout: "https://github.com/o/r/issues/7\n", stderr: "" });
      }
      assert.deepEqual(args.slice(0, 2), ["api", "graphql"]);
      return respond({
        code: 0,
        stdout: JSON.stringify(observation(remote.assignees)),
        stderr: "",
      });
    };
    const tool = createWorkItemTool({ exec });
    const fake = createFakePi({ cwd });
    const run = (params: Record<string, unknown>) =>
      tool.execute("a", params as never, undefined, undefined, fake.ctx as never);
    return { remote, calls, run };
  };

  await t.test("unknown user after dispatch is uncertain and never retried", async () => {
    const { calls, run } = setup({
      reply: (args, output) =>
        args[1] === "edit" ? { code: 1, stdout: "", stderr: "unknown user alice" } : output,
    });
    const result = await run(assignment);
    assert.equal(result.isError, true);
    assert.equal(payload(result).kind, "uncertain");
    assert.equal(payload(result).ownership, "not-exclusive");
    assert.deepEqual(payload(result).before, ["bob"]);
    assert.equal(payload(result).after, null);
    assert.match(payload(result).message, /Re-read.*before retrying.*not automatically retry/);
    assert.equal(calls.length, 2);
    assertSafe(calls);
  });

  await t.test(
    "invalid IDs and nonexplicit or duplicate logins are refused before Exec",
    async () => {
      for (const invalid of [
        ...["0", "-1", "1.5", "07", "9007199254740992", "7; echo nope", ""].map((id) => ({ id })),
        ...[
          [],
          [""],
          ["@me"],
          ["--help"],
          ["alice,bob"],
          ["alice", "ALICE"],
          [" alice"],
          ["a;b"],
          ["a--b"],
          ["a".repeat(40)],
        ].map((assignees) => ({ assignees })),
        { operation: "replace" },
      ]) {
        const { remote, calls, run } = setup();
        const result = await run({ ...assignment, ...invalid });
        assert.equal(result.isError, true, JSON.stringify(invalid));
        assert.equal(payload(result).kind, "not-attempted");
        assert.equal(payload(result).ownership, "not-exclusive");
        assert.equal(payload(result).after, null);
        assert.deepEqual(calls, []);
        assert.deepEqual(remote, { assignees: ["bob"], field: "Ready", lifecycle: "OPEN" });
      }
    },
  );

  await t.test(
    "missing assignment parameters or repository config and unsupported adapters write nothing",
    async () => {
      for (const key of ["id", "operation", "assignees"]) {
        const { calls, run } = setup();
        const params: Record<string, unknown> = { ...assignment };
        delete params[key];
        const result = await run(params);
        assert.equal(result.isError, true);
        assert.match(JSON.stringify(result.content), new RegExp(`assign needs ${key}`));
        assert.deepEqual(calls, []);
      }
      for (const config of [
        'version = 1\n[tracker]\nkind = "github"\n',
        'version = 1\n[tracker]\nkind = "repo-files"\n',
      ]) {
        const { calls, run } = setup({ config });
        const inspection = await run({ action: "inspect" });
        assert.equal(inspection.isError, false);
        assert.doesNotMatch(JSON.stringify(inspection.content), /assign/);
        const result = await run(assignment);
        assert.equal(result.isError, true);
        assert.match(JSON.stringify(result.content), /tracker.repo|unsupported/);
        assert.deepEqual(calls, []);
      }
      const { calls, run } = setup();
      const result = await run({ action: "inspect" });
      assert.equal(result.isError, false);
      const text = result.content.find((part) => part.type === "text");
      assert.ok(text?.type === "text");
      const inspection = JSON.parse(text.text);
      assert.ok(inspection.capabilities.includes("assign"));
      assert.equal(inspection.project, null);
      assert.deepEqual(calls, []);
    },
  );

  await t.test(
    "permission failures refuse preflight or report uncertainty after dispatch",
    async () => {
      for (const failure of ["graphql", "edit"]) {
        const { calls, run, remote } = setup({
          reply: (args, output) =>
            args[1] === failure ? { code: 1, stdout: "", stderr: "HTTP 403 forbidden" } : output,
        });
        const result = await run(assignment);
        assert.equal(result.isError, true);
        assert.equal(payload(result).kind, failure === "graphql" ? "not-attempted" : "uncertain");
        assert.match(payload(result).message, /HTTP 403 forbidden/);
        assert.equal(payload(result).ownership, "not-exclusive");
        assert.equal(calls.length, failure === "graphql" ? 1 : 2);
        assert.equal(remote.lifecycle, "OPEN");
        if (failure === "graphql")
          assert.deepEqual(remote, { assignees: ["bob"], field: "Ready", lifecycle: "OPEN" });
        else assert.match(payload(result).message, /Re-read.*before retrying/);
        assertSafe(calls);
      }
    },
  );

  await t.test(
    "timeouts and thrown Exec after dispatch remain uncertain without retries",
    async () => {
      for (const mode of ["exit", "killed", "throw"]) {
        const { remote, calls, run } = setup({
          reply: (args, output) => {
            if (args[1] !== "edit") return output;
            if (mode === "throw") throw new Error("transport lost");
            if (mode === "killed") return { ...output, killed: true };
            return { code: 124, stdout: "", stderr: "timed out" };
          },
        });
        const result = await run(assignment);
        assert.equal(result.isError, true);
        assert.equal(payload(result).kind, "uncertain");
        assert.equal(payload(result).ownership, "not-exclusive");
        assert.equal(payload(result).after, null);
        assert.match(payload(result).message, /Re-read.*before retrying.*not automatically retry/);
        assert.deepEqual(remote.assignees, ["bob", "alice"]);
        assert.equal(remote.field, "Human selected");
        assert.equal(remote.lifecycle, "OPEN");
        assert.equal(calls.length, 2);
        assertSafe(calls);
      }
    },
  );

  await t.test(
    "incomplete or invalid reads refuse preflight and make readback uncertain",
    async () => {
      const malformed: ((issue: ObservedIssue) => unknown)[] = [
        (issue) => ({ ...issue, assignees: undefined }),
        (issue) => ({
          ...issue,
          assignees: { ...issue.assignees, pageInfo: { hasNextPage: true } },
        }),
        (issue) => ({ ...issue, assignees: { ...issue.assignees, totalCount: 99 } }),
        (issue) => ({ ...issue, assignees: { ...issue.assignees, nodes: [null] } }),
        (issue) => ({ ...issue, number: 8 }),
        (issue) => ({ ...issue, url: "https://github.com/foreign/repo/issues/7" }),
        (issue) => ({ ...issue, repository: { nameWithOwner: "foreign/repo" } }),
        (issue) => ({ ...issue, assignees: { ...issue.assignees, nodes: [{ login: "@me" }] } }),
      ];
      for (const at of [1, 3]) {
        for (const change of malformed) {
          const { calls, run } = setup({
            reply: (_args, output, call) => {
              if (call !== at) return output;
              const response = observation(at === 1 ? ["bob"] : ["bob", "alice"]);
              return {
                ...output,
                stdout: JSON.stringify({
                  data: {
                    repository: {
                      issue: change(response.data.repository.issue),
                    },
                  },
                }),
              };
            },
          });
          const result = await run(assignment);
          assert.equal(result.isError, true);
          assert.equal(payload(result).kind, at === 1 ? "not-attempted" : "uncertain");
          assert.equal(payload(result).ownership, "not-exclusive");
          assert.equal(payload(result).after, null);
          if (at === 3) assert.match(payload(result).message, /Re-read.*before retrying/);
          assert.equal(calls.length, at);
          assertSafe(calls);
        }
        for (const stdout of [
          "not json",
          JSON.stringify({ ...observation(["bob"]), errors: [{ message: "partial" }] }),
        ]) {
          const { calls, run } = setup({
            reply: (_args, output, call) => (call === at ? { ...output, stdout } : output),
          });
          const result = await run(assignment);
          assert.equal(result.isError, true);
          assert.equal(payload(result).kind, at === 1 ? "not-attempted" : "uncertain");
          assert.equal(calls.length, at);
          assertSafe(calls);
        }
      }
    },
  );

  await t.test(
    "partial edits, lost unrelated assignees and changed issue identity are uncertain",
    async () => {
      for (const scenario of [
        { operation: "add", assignees: ["alice", "carol"], after: ["bob", "alice"], id: "I_7" },
        { operation: "add", assignees: ["alice"], after: ["alice"], id: "I_7" },
        { operation: "remove", assignees: ["alice"], after: ["bob", "alice"], id: "I_7" },
        { operation: "add", assignees: ["alice"], after: ["bob", "alice"], id: "I_other" },
      ]) {
        const { remote, calls, run } = setup({
          reply: (_args, output, call) => {
            if (call !== 3) return output;
            const response = observation(scenario.after);
            response.data.repository.issue.id = scenario.id;
            return { ...output, stdout: JSON.stringify(response) };
          },
        });
        if (scenario.operation === "remove") remote.assignees = ["bob", "alice"];
        const result = await run({
          ...assignment,
          operation: scenario.operation,
          assignees: scenario.assignees,
        });
        assert.equal(result.isError, true);
        assert.equal(payload(result).kind, "uncertain");
        assert.equal(payload(result).ownership, "not-exclusive");
        assert.match(payload(result).message, /Re-read.*before retrying/);
        assert.equal(calls.length, 3);
        assertSafe(calls);
      }
    },
  );

  await t.test("invalid edit acknowledgements and failed fresh reads are uncertain", async () => {
    for (const acknowledgement of [
      "",
      "https://github.com/o/r/issues/8",
      "done",
      "https://github.com/o/r/issues/7\npartial failure",
    ]) {
      const { calls, run } = setup({
        reply: (args, output) =>
          args[1] === "edit" ? { ...output, stdout: acknowledgement } : output,
      });
      const result = await run(assignment);
      assert.equal(result.isError, true);
      assert.equal(payload(result).kind, "uncertain");
      assert.equal(payload(result).ownership, "not-exclusive");
      assert.match(payload(result).message, /Re-read.*before retrying/);
      assert.equal(calls.length, 2);
      assertSafe(calls);
    }
    for (const failure of ["permission", "timeout", "throw"]) {
      const { calls, run } = setup({
        reply: (_args, output, call) => {
          if (call !== 3) return output;
          if (failure === "throw") throw new Error("read lost");
          return { code: failure === "timeout" ? 124 : 1, stdout: "", stderr: failure };
        },
      });
      const result = await run(assignment);
      assert.equal(result.isError, true);
      assert.equal(payload(result).kind, "uncertain");
      assert.equal(payload(result).after, null);
      assert.match(payload(result).message, /Re-read.*before retrying/);
      assert.equal(calls.length, 3);
      assertSafe(calls);
    }
  });

  await t.test("assignment is not an exclusive claim", async () => {
    const { remote, calls, run } = setup();
    const result = await run({ action: "assign", id: "7", operation: "add", assignees: ["alice"] });
    assert.equal(result.isError, false);
    assert.deepEqual(remote.assignees, ["bob", "alice"]);
    assert.equal(remote.field, "Human selected");
    assert.equal(remote.lifecycle, "OPEN");
    const text = result.content.find((part) => part.type === "text");
    assert.ok(text?.type === "text");
    assert.equal(JSON.parse(text.text).ownership, "not-exclusive");
    assert.deepEqual(
      calls.map((call) => call.args.slice(0, 2)),
      [
        ["api", "graphql"],
        ["issue", "edit"],
        ["api", "graphql"],
      ],
    );
    assert.deepEqual(calls[1], {
      command: "gh",
      args: ["issue", "edit", "7", "--add-assignee", "alice", "--repo", "o/r"],
    });
    assert.ok(calls.every((call) => !/Project|label|close|reopen/.test(call.args.join(" "))));
  });

  await t.test("removal changes only named assignees in one edit", async () => {
    const { remote, calls, run } = setup();
    remote.assignees = ["bob", "alice", "carol"];
    const result = await run({ ...assignment, operation: "remove", assignees: ["alice", "carol"] });
    assert.equal(result.isError, false);
    assert.deepEqual(payload(result), {
      kind: "confirmed",
      message: "Assignment verified by fresh readback; not atomic and not an exclusive claim.",
      before: ["bob", "alice", "carol"],
      after: ["bob"],
      ownership: "not-exclusive",
    });
    assert.deepEqual(remote.assignees, ["bob"]);
    assert.equal(remote.field, "Human selected");
    assert.equal(remote.lifecycle, "OPEN");
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1]?.args, [
      "issue",
      "edit",
      "7",
      "--remove-assignee",
      "alice",
      "--remove-assignee",
      "carol",
      "--repo",
      "o/r",
    ]);
    assertSafe(calls);
  });

  await t.test("already satisfied add and remove are verified no-ops", async () => {
    for (const request of [
      { operation: "add", assignees: ["BOB"] },
      { operation: "remove", assignees: ["alice"] },
    ]) {
      const { remote, calls, run } = setup();
      const result = await run({ ...assignment, ...request });
      assert.equal(result.isError, false);
      assert.equal(payload(result).kind, "confirmed");
      assert.equal(payload(result).ownership, "not-exclusive");
      assert.match(payload(result).message, /already satisfied.*no edit/i);
      assert.deepEqual(payload(result).before, ["bob"]);
      assert.deepEqual(payload(result).after, ["bob"]);
      assert.deepEqual(remote, { assignees: ["bob"], field: "Ready", lifecycle: "OPEN" });
      assert.equal(calls.length, 1);
      assertSafe(calls);
    }
  });
});
