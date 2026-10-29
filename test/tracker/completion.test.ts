import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { createGithubTracker } from "../../src/tracker/github.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("completion contracts", async (suite) => {
  const refs = [
    { repository: "o/r", number: 1 },
    { repository: "o/r", number: 2 },
  ];
  const head = "a".repeat(40);
  function pr(number: number, merged: boolean) {
    return {
      data: {
        repository: {
          nameWithOwner: "o/r",
          pullRequest: {
            number,
            url: `https://github.com/o/r/pull/${number}`,
            headRefOid: head,
            baseRefName: "main",
            state: merged ? "MERGED" : "OPEN",
            isDraft: false,
            mergedAt: merged ? "2026-01-01T00:00:00Z" : null,
            mergeCommit: merged ? { oid: "b".repeat(40) } : null,
            commits: {
              nodes: [
                {
                  commit: {
                    oid: head,
                    statusCheckRollup: {
                      contexts: {
                        nodes: [
                          {
                            __typename: "CheckRun",
                            id: `check-${number}`,
                            name: "CI",
                            status: "COMPLETED",
                            conclusion: "SUCCESS",
                          },
                        ],
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };
  }
  function fixture(
    t: TestContext,
    policy = 'manifest_dir="docs/delivery"\nrequire_manifest=true\nrequire_merged=true\nrequired_checks=["CI"]',
  ) {
    const cwd = mkdtempSync(join(tmpdir(), "devsys-completion-"));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    execFileSync("git", ["init", "--quiet", cwd]);
    mkdirSync(join(cwd, "docs/delivery"), { recursive: true });
    mkdirSync(join(cwd, "nested"));
    const configPath = join(cwd, ".development-system.toml");
    const config = (evidence: string | null) =>
      writeFileSync(
        configPath,
        `[tracker]\nkind="github"\nrepo="o/r"\n${evidence === null ? "" : `[delivery.evidence]\n${evidence}\n`}`,
      );
    config(policy);
    const manifestPath = join(cwd, "docs/delivery/7.json");
    const manifest = {
      version: 1,
      issue: { repository: "o/r", number: 7 },
      pullRequests: refs,
      manualRequirements: [] as string[],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    execFileSync("git", ["-C", cwd, "add", "docs"]);
    const calls: string[][] = [];
    let closed = false;
    const responses = new Map([
      [1, pr(1, true)],
      [2, pr(2, false)],
    ]);
    const hooks = {
      afterPr: () => {
        /* default: no race injection */
      },
      afterGit: () => {
        /* default: no race injection */
      },
      afterView: () => {
        /* default: no race injection */
      },
      close: undefined as undefined | (() => { code: number; stdout: string; stderr: string }),
      issue: undefined as unknown,
    };
    const exec: Exec = async (command, args, options) => {
      if (command === "git") {
        try {
          const stdout = execFileSync(command, args, {
            cwd: options?.cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          hooks.afterGit();
          return { code: 0, stdout, stderr: "" };
        } catch {
          return { code: 1, stdout: "", stderr: "not tracked" };
        }
      }
      assert.equal(command, "gh");
      calls.push(args);
      if (args[0] === "api") {
        const number = Number(args.find((arg) => arg.startsWith("number="))?.slice(7));
        const response = responses.get(number);
        hooks.afterPr();
        return { code: 0, stdout: JSON.stringify(response), stderr: "" };
      }
      if (args[1] === "close") {
        closed = true;
        return hooks.close?.() ?? { code: 0, stdout: "", stderr: "" };
      }
      assert.equal(args[1], "view", "completion must not edit labels/title/Project");
      hooks.afterView();
      return {
        code: 0,
        stdout: JSON.stringify(
          hooks.issue ?? {
            number: 7,
            title: "Whole issue",
            body: "",
            state: closed ? "CLOSED" : "OPEN",
            labels: [],
            comments: [],
            url: "https://github.com/o/r/issues/7",
          },
        ),
        stderr: "",
      };
    };
    const run = (parameters: Record<string, unknown>, nested = false) => {
      const tool = createWorkItemTool({ exec }); // every call is a fresh public instance
      const fake = createFakePi({ cwd: nested ? join(cwd, "nested") : cwd });
      return tool.execute("test", parameters as never, undefined, undefined, fake.ctx as never);
    };
    return {
      cwd,
      exec,
      run,
      calls,
      responses,
      hooks,
      config,
      configPath,
      manifest,
      manifestPath,
      setClosed: () => {
        closed = true;
      },
    };
  }
  const text = (result: { content: unknown }) => JSON.stringify(result.content);
  const decoded = (result: { content: readonly { type: string; text?: string }[] }) =>
    JSON.parse(result.content.find((part) => part.type === "text")?.text ?? "null");
  const closeCalls = (calls: string[][]) => calls.filter((args) => args[1] === "close");

  await suite.test(
    "two-PR manifest survives a fresh tool and blocks partial completion",
    async (t) => {
      const host = fixture(t);
      const observed = await host.run({ action: "delivery-check", id: "7" }, true);
      assert.notEqual(observed.isError, true, text(observed));
      assert.equal(decoded(observed).status, "pending");
      assert.equal(decoded(observed).observations.length, 2);
      const partial = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.equal(partial.isError, true);
      assert.match(text(partial), /pending/);
      assert.equal(closeCalls(host.calls).length, 0);
      host.responses.set(2, pr(2, true));
      const complete = await host.run({ action: "complete", id: "7", scopeConfirmed: true }, true);
      assert.notEqual(complete.isError, true, text(complete));
      assert.equal(decoded(complete).kind, "confirmed");
      assert.equal(decoded(complete).issue.status, "done");
      assert.equal(decoded(complete).delivery.status, "satisfied");
      assert.equal(closeCalls(host.calls).length, 1);
      assert.equal(host.calls.at(-1)?.[1], "view");
      assert.equal(host.calls.filter((args) => args[0] === "api").length, 6);
    },
  );

  await suite.test(
    "configured raw done cannot partly edit title/labels or bypass the guard through direct adapter update",
    async (t) => {
      const host = fixture(t);
      const result = await host.run({
        action: "update",
        id: "7",
        status: "done",
        title: "Partial",
        labels: ["changed"],
      });
      assert.equal(result.isError, true);
      assert.match(text(result), /complete/);
      assert.deepEqual(host.calls, [], "guard must precede even issue reads and every write");
      const adapter = createGithubTracker({ exec: host.exec, cwd: host.cwd, repo: "o/r" });
      const direct = await adapter.update("7", {
        status: "done",
        title: "Partial",
        labels: ["changed"],
      });
      assert.equal(direct.ok, false);
      if (!direct.ok) assert.match(direct.error.message, /complete/);
      assert.deepEqual(host.calls, []);
    },
  );

  await suite.test("require_manifest alone does not imply merge or unrelated checks", async (t) => {
    const host = fixture(t, 'manifest_dir="docs/delivery"\nrequire_manifest=true');
    host.responses.set(1, pr(1, false));
    const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
    assert.notEqual(result.isError, true, text(result));
    const completion = decoded(result);
    assert.equal(completion.delivery.status, "satisfied");
    assert.deepEqual(
      completion.delivery.conditions.map((condition: { name: string }) => condition.name),
      ["manifest", "manifest"],
    );
    assert.equal(closeCalls(host.calls).length, 1);
  });

  await suite.test(
    "empty configured policy is unassessed and cannot silently invent a merge rule",
    async (t) => {
      const host = fixture(t, "");
      const observed = await host.run({ action: "delivery-check", id: "7", refs });
      assert.notEqual(observed.isError, true, text(observed));
      assert.equal(decoded(observed).status, "unassessed");
      assert.deepEqual(decoded(observed).conditions, []);
      const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true, refs });
      assert.equal(result.isError, true);
      assert.match(text(result), /unassessed/);
      assert.equal(closeCalls(host.calls).length, 0);
    },
  );

  await suite.test(
    "complete requires explicit whole-issue scope even without evidence; legacy unconfigured done stays compatible",
    async (t) => {
      const host = fixture(t);
      host.config(null);
      for (const scopeConfirmed of [undefined, false]) {
        const result = await host.run({ action: "complete", id: "7", scopeConfirmed });
        assert.equal(result.isError, true);
        assert.match(text(result), /scopeConfirmed/);
      }
      assert.deepEqual(host.calls, []);
      const direct = await createGithubTracker({
        exec: host.exec,
        cwd: host.cwd,
        repo: "o/r",
      }).complete?.("7", { scopeConfirmed: false } as never);
      assert.equal(direct?.ok, false);
      assert.deepEqual(host.calls, []);
      const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.notEqual(result.isError, true, text(result));
      assert.equal(decoded(result).delivery.status, "unconfigured");
      assert.match(decoded(result).message, /not evaluated/);
      assert.equal(host.calls.filter((args) => args[0] === "api").length, 0);
      const legacy = await host.run({ action: "update", id: "7", status: "done" });
      assert.notEqual(legacy.isError, true, text(legacy));
    },
  );

  await suite.test(
    "explicit refs cannot narrow a present manifest and caller conditions cannot weaken completion",
    async (t) => {
      const host = fixture(t);
      const narrowed = await host.run({
        action: "complete",
        id: "7",
        scopeConfirmed: true,
        refs: [refs[0]],
      });
      assert.equal(narrowed.isError, true);
      assert.match(text(narrowed), /conflict/);
      assert.deepEqual(host.calls, []);
      const weakened = await host.run({
        action: "complete",
        id: "7",
        scopeConfirmed: true,
        conditions: { requireMerge: false },
      });
      assert.equal(weakened.isError, true);
      assert.match(text(weakened), /pending/);
      const idConditions = await host.run({ action: "delivery-check", id: "7", conditions: {} });
      assert.equal(idConditions.isError, true);
      assert.match(text(idConditions), /configured conditions/);
      assert.equal(closeCalls(host.calls).length, 0);
    },
  );

  await suite.test(
    "optional absent manifest accepts explicit refs; invalid existing manifest never falls back",
    async (t) => {
      const host = fixture(t, 'manifest_dir="docs/delivery"\nrequired_checks=["CI"]');
      unlinkSync(host.manifestPath);
      const absent = await host.run({ action: "delivery-check", id: "7", refs });
      assert.notEqual(absent.isError, true, text(absent));
      assert.equal(decoded(absent).status, "satisfied");
      writeFileSync(host.manifestPath, "{bad");
      const invalid = await host.run({ action: "complete", id: "7", scopeConfirmed: true, refs });
      assert.equal(invalid.isError, true);
      assert.match(text(invalid), /manifest/);
      assert.equal(closeCalls(host.calls).length, 0);
    },
  );

  await suite.test("required missing manifest blocks before remote observation", async (t) => {
    const host = fixture(t);
    unlinkSync(host.manifestPath);
    const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true, refs });
    assert.equal(result.isError, true);
    assert.match(text(result), /required manifest is missing/);
    assert.deepEqual(host.calls, []);
  });

  await suite.test(
    "id-only empty evidence policy is explicitly unassessed without inventing a PR set",
    async (t) => {
      const host = fixture(t, "");
      const observed = await host.run({ action: "delivery-check", id: "7" });
      assert.notEqual(observed.isError, true, text(observed));
      assert.equal(decoded(observed).status, "unassessed");
      assert.deepEqual(decoded(observed).observations, []);
      const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.equal(result.isError, true);
      assert.match(text(result), /unassessed/);
      assert.deepEqual(host.calls, []);
    },
  );

  await suite.test(
    "configuration edited during final manifest revalidation cannot escape the close guard",
    async (t) => {
      const host = fixture(t);
      host.responses.set(2, pr(2, true));
      host.hooks.afterView = () => {
        host.hooks.afterGit = () =>
          host.config('manifest_dir="docs/delivery"\nrequire_manifest=true\nbase="release"');
      };
      const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.equal(result.isError, true);
      assert.match(text(result), /configuration changed/);
      assert.equal(closeCalls(host.calls).length, 0);
    },
  );

  function configureScenario(host: ReturnType<typeof fixture>, scenario: string) {
    const response = pr(2, true);
    const pull = response.data.repository.pullRequest;
    const commit = pull.commits.nodes.at(0)?.commit;
    assert.ok(commit);
    const check = commit.statusCheckRollup.contexts.nodes.at(0);
    assert.ok(check);
    if (scenario === "draft") {
      pull.state = "OPEN";
      pull.mergedAt = null;
      pull.mergeCommit = null;
      pull.isDraft = true;
    }
    if (scenario === "failed") check.conclusion = "FAILURE";
    if (scenario === "old-head") commit.oid = "c".repeat(40);
    if (scenario === "unknown") check.conclusion = "NEUTRAL";
    if (scenario === "manual") {
      host.manifest.manualRequirements.push("Human approval");
      writeFileSync(host.manifestPath, JSON.stringify(host.manifest));
    }
    if (scenario === "wrong-base") {
      host.config('manifest_dir="docs/delivery"\nrequire_manifest=true\nbase="release"');
    }
    host.responses.set(2, response);
    if (scenario === "partial")
      host.responses.set(2, {
        ...response,
        errors: [{ message: "partial API response" }],
      } as never);
    if (scenario === "permission")
      host.hooks.afterPr = () => {
        throw new Error("permission denied");
      };
    if (scenario === "timeout")
      host.hooks.afterPr = () => {
        throw new Error("request timed out");
      };
  }

  for (const scenario of [
    "draft",
    "failed",
    "old-head",
    "unknown",
    "manual",
    "wrong-base",
    "partial",
    "permission",
    "timeout",
  ] as const) {
    await suite.test(`complete refuses ${scenario} evidence without any mutation`, async (t) => {
      const host = fixture(t);
      configureScenario(host, scenario);
      const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.equal(result.isError, true, scenario);
      if (scenario === "manual") assert.match(text(result), /unknown/);
      if (scenario === "permission") assert.match(text(result), /permission denied/);
      if (scenario === "timeout") assert.match(text(result), /timed out/);
      assert.equal(closeCalls(host.calls).length, 0);
      assert.ok(
        host.calls.every((args) => args[0] === "api"),
        "bad evidence must fail before issue operations",
      );
    });
  }

  for (const change of [
    "manifest",
    "config",
    "config-at-issue-read",
    "removed",
    "invalid-config",
  ] as const) {
    await suite.test(
      `complete revalidates ${change} after asynchronous observations before close`,
      async (t) => {
        const host = fixture(t);
        host.responses.set(2, pr(2, true));
        const mutate = () => {
          if (change === "manifest")
            writeFileSync(host.manifestPath, `${JSON.stringify(host.manifest)}\n`);
          else if (change === "removed") rmSync(host.manifestPath, { force: true });
          else if (change === "invalid-config") writeFileSync(host.configPath, "broken TOML = [");
          else host.config('manifest_dir="docs/delivery"\nrequire_manifest=true\nbase="release"');
        };
        if (change === "config-at-issue-read") host.hooks.afterView = mutate;
        else host.hooks.afterPr = mutate;
        const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
        assert.equal(result.isError, true);
        assert.equal(closeCalls(host.calls).length, 0);
      },
    );
  }

  await suite.test(
    "already-closed issue is a verified no-op but still requires configured delivery evidence",
    async (t) => {
      const host = fixture(t);
      host.setClosed();
      const blocked = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.equal(blocked.isError, true);
      host.responses.set(2, pr(2, true));
      const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.notEqual(result.isError, true, text(result));
      assert.match(decoded(result).message, /no-op/);
      assert.equal(closeCalls(host.calls).length, 0);
    },
  );

  for (const outcome of [
    "denied",
    "timeout",
    "post-open",
    "post-identity",
    "post-malformed",
  ] as const) {
    await suite.test(
      `dispatched close with ${outcome} is uncertain, never retried or rolled back`,
      async (t) => {
        const host = fixture(t);
        host.responses.set(2, pr(2, true));
        host.hooks.close = () => {
          if (outcome === "denied")
            return { code: 1, stdout: "", stderr: "permission denied ghp_fakeCredential" };
          if (outcome === "timeout") throw new Error("request timed out");
          host.hooks.issue =
            outcome === "post-malformed"
              ? { state: "CLOSED" }
              : {
                  number: outcome === "post-identity" ? 8 : 7,
                  title: "Issue",
                  body: "",
                  state: "OPEN",
                  labels: [],
                  comments: [],
                  url: "https://github.com/o/r/issues/7",
                };
          return { code: 0, stdout: "", stderr: "" };
        };
        const result = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
        assert.equal(result.isError, true);
        const completion = decoded(result);
        assert.equal(completion.kind, "uncertain");
        assert.match(completion.message, /[Rr]e-read/);
        assert.match(completion.message, /rollback/);
        assert.doesNotMatch(completion.message, /fakeCredential/);
        assert.equal(closeCalls(host.calls).length, 1);
        assert.ok(
          host.calls.every(
            (args) => args[0] === "api" || ["view", "close"].includes(args[1] ?? ""),
          ),
        );
      },
    );
  }

  await suite.test(
    "completion rejects ambiguous repository/issue identity before closing",
    async (t) => {
      const host = fixture(t);
      for (const id of ["0", "-1", "7x", "01", "9007199254740992"]) {
        const result = await host.run({ action: "complete", id, scopeConfirmed: true });
        assert.equal(result.isError, true);
      }
      const missingRepo = await createGithubTracker({ exec: host.exec, cwd: host.cwd }).complete?.(
        "7",
        { scopeConfirmed: true },
      );
      assert.equal(missingRepo?.ok, false);
      assert.deepEqual(host.calls, []);
      host.responses.set(2, pr(2, true));
      host.hooks.issue = {
        number: 7,
        title: "Issue",
        body: "",
        state: "OPEN",
        labels: [],
        comments: [],
        url: "https://github.com/wrong/repo/issues/7",
      };
      const mismatch = await host.run({ action: "complete", id: "7", scopeConfirmed: true });
      assert.equal(mismatch.isError, true);
      assert.equal(closeCalls(host.calls).length, 0);
    },
  );
});
