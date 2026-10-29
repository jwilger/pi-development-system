import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Value } from "typebox/value";
import type { Exec } from "../../src/core/exec.ts";
import type { ConditionAssessment, ConditionState } from "../../src/tracker/delivery-assessment.ts";
import { observePullRequest } from "../../src/tracker/github-delivery.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const head = "a".repeat(40);
const ref = { repository: "o/r", number: 1 };
const check = {
  __typename: "CheckRun",
  id: "check-1",
  name: "CI",
  status: "COMPLETED",
  conclusion: "SUCCESS",
};
function page(nodes: unknown[] = [check], hasNextPage = false, endCursor: string | null = null) {
  return {
    data: {
      repository: {
        nameWithOwner: "o/r",
        pullRequest: {
          number: 1,
          url: "https://github.com/o/r/pull/1",
          headRefOid: head,
          baseRefName: "main",
          state: "OPEN",
          isDraft: false,
          mergedAt: null,
          mergeCommit: null,
          autoMergeRequest: { enabledAt: "2026-01-01T00:00:00Z" },
          commits: {
            nodes: [
              {
                commit: {
                  oid: head,
                  statusCheckRollup: {
                    contexts: { nodes, pageInfo: { hasNextPage, endCursor } },
                  },
                },
              },
            ] satisfies [unknown],
          },
        },
      },
    },
  };
}
function setup(
  t: TestContext,
  responses: unknown[] = [page()],
  failure?: Error | { code: number; stdout: string; stderr: string },
) {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-delivery-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    'version=1\n[tracker]\nkind="github"\nrepo="o/r"\n',
  );
  const calls: { command: string; args: readonly string[] }[] = [];
  const exec: Exec = (command, args) => {
    calls.push({ command, args });
    if (failure instanceof Error) throw failure;
    return Promise.resolve(
      failure ?? { code: 0, stdout: JSON.stringify(responses[calls.length - 1]), stderr: "" },
    );
  };
  const tool = createWorkItemTool({ exec });
  const fake = createFakePi({ cwd });
  const run = (parameters: Record<string, unknown>) =>
    tool.execute("test", parameters as never, undefined, undefined, fake.ctx as never);
  return { run, calls, tool };
}
const decoded = (result: { content: readonly { type: string; text?: string }[] }) =>
  JSON.parse(result.content.find((part) => part.type === "text")?.text ?? "null");
function isReadOnly(calls: { command: string; args: readonly string[] }[]) {
  return calls.every(
    ({ command, args }) =>
      command === "gh" &&
      args[0] === "api" &&
      args[1] === "graphql" &&
      !args.some((arg) => /mutation|issue close/.test(arg)),
  );
}

test("delivery API diagnostics preserve the refusal without exposing credential-shaped fields", async (t) => {
  const host = setup(t, [], {
    code: 1,
    stdout: "",
    stderr: "HTTP 403 forbidden API_KEY=fixture-secret\nCookie: session=fixture-session",
  });
  const result = await host.run({ action: "delivery-check", refs: [ref] });
  assert.equal(result.isError, true);
  const text = result.content.find((part) => part.type === "text")?.text ?? "";
  assert.match(text, /HTTP 403 forbidden/);
  assert.match(text, /redacted/);
  assert.doesNotMatch(text, /fixture-secret|fixture-session/);
  assert.ok(isReadOnly(host.calls));
});

test("armed auto-merge remains pending through public delivery-check", async (t) => {
  const host = setup(t);
  const request = {
    action: "delivery-check",
    refs: [ref],
    conditions: { requireMerge: true, requiredChecks: ["CI"] },
  };
  assert.ok(Value.Check(host.tool.parameters, request), "public action must accept delivery-check");
  const result = await host.run(request);
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const assessment = decoded(result);
  assert.equal(assessment.status, "pending");
  assert.deepEqual(
    assessment.conditions.map((condition: ConditionAssessment) => [
      condition.name,
      condition.status,
    ]),
    [
      ["merge", "pending"],
      ["CI", "satisfied"],
    ],
  );
  assert.equal(host.calls.length, 1);
  assert.ok(isReadOnly(host.calls));
});

test("all context pages bind checks to the current commit with separate argv variables", async (t) => {
  const second = { __typename: "StatusContext", id: "status-2", context: "CI", state: "FAILURE" };
  const host = setup(t, [page([check], true, "next+/="), page([second])]);
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requiredChecks: ["CI"] },
  });
  assert.notEqual(result.isError, true);
  assert.equal(decoded(result).status, "failed");
  assert.deepEqual(decoded(result).observations[0].checks, [
    { name: "CI", headOid: head, state: "success" },
    { name: "CI", headOid: head, state: "failure" },
  ]);
  assert.equal(host.calls.length, 2);
  const args = host.calls[1]?.args ?? [];
  for (const variable of ["owner=o", "repo=r", "number=1", "cursor=next+/="])
    assert.ok(args.includes(variable));
  const query = args.find((arg) => arg.startsWith("query=")) ?? "";
  assert.match(query, /commits\(last:1\)/);
  assert.match(query, /contexts\(first:100,after:\$cursor\)/);
  assert.ok(!query.includes("mutation"));
  assert.ok(isReadOnly(host.calls));
});

test("changed revision or PR facts on page two refuse the entire observation", async (t) => {
  for (const change of [
    { headRefOid: "b".repeat(40) },
    { baseRefName: "release" },
    { isDraft: true },
    { state: "CLOSED" },
    { state: "MERGED", mergedAt: "2026-01-01T00:00:00Z", mergeCommit: { oid: "c".repeat(40) } },
    { number: 2 },
    { url: "https://github.com/o/r/pull/2" },
  ]) {
    const next = page([{ ...check, id: "check-2" }]);
    Object.assign(next.data.repository.pullRequest, change);
    if (change.headRefOid)
      next.data.repository.pullRequest.commits.nodes[0].commit.oid = change.headRefOid;
    const host = setup(t, [page([check], true, "next"), next]);
    const result = await host.run({
      action: "delivery-check",
      refs: [ref],
      conditions: { requiredChecks: ["CI"] },
    });
    assert.equal(result.isError, true, JSON.stringify(change));
    assert.match(JSON.stringify(result.content), /unknown.*(changed|mismatch)/);
    assert.equal(host.calls.length, 2);
    assert.ok(isReadOnly(host.calls));
  }
});

test("old last-commit checks can never pass as current-head evidence", async (t) => {
  const old = page();
  old.data.repository.pullRequest.commits.nodes[0].commit.oid = "b".repeat(40);
  const host = setup(t, [old]);
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requiredChecks: ["CI"] },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /last commit oid.*current head/);
  assert.ok(isReadOnly(host.calls));
});

test("null rollup, absent checks and manual evidence stay unknown; absent policy is unassessed", async (t) => {
  const empty = page();
  const commit = empty.data.repository.pullRequest.commits.nodes[0].commit;
  Object.assign(commit, { statusCheckRollup: null });
  for (const response of [page(), empty]) {
    for (const conditions of [
      undefined,
      {},
      { requireMerge: false },
      { requiredChecks: ["missing"], manualRequirements: ["Human approval"] },
    ]) {
      const host = setup(t, [response]);
      const result = await host.run({
        action: "delivery-check",
        refs: [ref],
        ...(conditions === undefined ? {} : { conditions }),
      });
      assert.notEqual(result.isError, true);
      const assessment = decoded(result);
      assert.equal(assessment.status, conditions?.requiredChecks ? "unknown" : "unassessed");
      if (conditions?.requiredChecks)
        assert.deepEqual(
          assessment.conditions.map((condition: { status: string }) => condition.status),
          ["unknown", "unknown"],
        );
      assert.ok(isReadOnly(host.calls));
    }
  }
});

test("CheckRun and StatusContext states never promote neutral or unsupported evidence", async (t) => {
  const cases = [
    ...["QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "PENDING"].map((status) => ({
      node: { ...check, status, conclusion: null },
      expected: "pending",
    })),
    ...["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].map((conclusion) => ({
      node: { ...check, conclusion },
      expected: "failed",
    })),
    ...["NEUTRAL", "SKIPPED", "STALE", "STARTUP_FAILURE", "UNKNOWN", null].map((conclusion) => ({
      node: { ...check, conclusion },
      expected: "unknown",
    })),
    { node: { ...check, status: "FUTURE_STATE" }, expected: "unknown" },
    ...Object.entries({
      SUCCESS: "satisfied",
      PENDING: "pending",
      EXPECTED: "pending",
      ERROR: "failed",
      FAILURE: "failed",
      UNSUPPORTED: "unknown",
    } satisfies Record<string, ConditionState>).map(([state, expected]) => ({
      node: { __typename: "StatusContext", id: "status-1", context: "CI", state },
      expected,
    })),
  ];
  for (const { node, expected } of cases) {
    const host = setup(t, [page([node])]);
    const result = await host.run({
      action: "delivery-check",
      refs: [ref],
      conditions: { requiredChecks: ["CI"] },
    });
    assert.notEqual(result.isError, true, JSON.stringify(node));
    assert.equal(decoded(result).status, expected, JSON.stringify(node));
    assert.ok(isReadOnly(host.calls));
  }
});

test("invalid explicit refs and condition entries fail before any Exec", async (t) => {
  const requests = [
    {},
    { refs: [] },
    { refs: [ref, ref] },
    { refs: [ref, { ...ref, repository: "O/R" }] },
    ...["r", "o/r/extra", "o/r\n", "o/ ", "-o/r", "o/.."].map((repository) => ({
      refs: [{ ...ref, repository }],
    })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null].map((number) => ({
      refs: [{ ...ref, number }],
    })),
    ...[
      { requireMerge: "true" },
      { targetBase: "" },
      { targetBase: " " },
      { requiredChecks: [""] },
      { requiredChecks: [" \n"] },
      { manualRequirements: [""] },
      { manualRequirements: [4] },
      { guessedPolicy: true },
      null,
    ].map((conditions) => ({ refs: [ref], conditions })),
  ];
  for (const request of requests) {
    const host = setup(t);
    const result = await host.run({ action: "delivery-check", ...request });
    assert.equal(result.isError, true, JSON.stringify(request));
    assert.deepEqual(host.calls, [], JSON.stringify(request));
  }
});

test("malformed, partial and inaccessible observations are unavailable evidence with re-read advice", async (t) => {
  const malformed: unknown[] = [
    null,
    {},
    { data: { repository: null } },
    { data: { repository: { nameWithOwner: "o/r", pullRequest: null } } },
    { ...page(), errors: [{ message: "Resource not accessible by integration" }] },
    { ...page(), errors: "invalid" },
    { errors: [{ message: "Access denied" }] },
    ...[
      { headRefOid: "not-an-oid" },
      { state: "open" },
      { isDraft: "false" },
      { number: 2 },
      { url: "https://github.com/elsewhere/repo/pull/1" },
      { url: "not a URL" },
      { mergedAt: "yesterday" },
      { mergeCommit: { oid: "b".repeat(40) } },
      { commits: { nodes: [] } },
      { commits: { nodes: [null] } },
    ].map((change) => {
      const response = page();
      Object.assign(response.data.repository.pullRequest, change);
      return response;
    }),
    ...[
      null,
      { ...check, id: "" },
      { ...check, name: "" },
      { ...check, status: 2 },
      { ...check, conclusion: false },
      { ...check, __typename: "Issue" },
    ].map((node) => page([node])),
  ];
  const wrongRepo = page();
  wrongRepo.data.repository.nameWithOwner = "other/repo";
  malformed.push(wrongRepo);
  for (const response of malformed) {
    const host = setup(t, [response]);
    const result = await host.run({
      action: "delivery-check",
      refs: [ref],
      conditions: { requiredChecks: ["CI"] },
    });
    assert.equal(result.isError, true, JSON.stringify(response));
    assert.match(JSON.stringify(result.content), /unknown.*[Rr]e-read/);
    assert.match(JSON.stringify(result.content), /No writes attempted/);
    assert.equal(host.calls.length, 1);
    assert.ok(isReadOnly(host.calls));
  }
});

test("process errors and page-two access failures discard success and retain original diagnostics", async (t) => {
  for (const failure of [
    new Error("process unavailable"),
    { code: 1, stdout: "", stderr: "permission denied" },
    { code: 0, stdout: "not json", stderr: "" },
  ]) {
    const host = setup(t, [], failure);
    const result = await host.run({ action: "delivery-check", refs: [ref] });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /unknown.*re-read/);
    if (failure instanceof Error)
      assert.match(JSON.stringify(result.content), /process unavailable/);
    else if (failure.code !== 0) assert.match(JSON.stringify(result.content), /permission denied/);
    assert.ok(isReadOnly(host.calls));
  }
  const host = setup(t, [
    page([check], true, "next"),
    { data: null, errors: [{ message: "permission denied on page two" }] },
  ]);
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requiredChecks: ["CI"] },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /permission denied on page two/);
  assert.equal(host.calls.length, 2);
  assert.ok(isReadOnly(host.calls));
});

test("duplicate contexts, cursor loops and incomplete pagination never return partial success", async (t) => {
  const cases = [
    [page([check, check])],
    [page([check], true, null)],
    [page([], true, "next")],
    [page([check], true, "next"), page([check])],
    [page([check], true, "next"), page([{ ...check, id: "check-2" }], true, "next")],
  ];
  const missingRollup = page();
  Object.assign(missingRollup.data.repository.pullRequest.commits.nodes[0].commit, {
    statusCheckRollup: null,
  });
  cases.push([page([check], true, "next"), missingRollup]);
  for (const responses of cases) {
    const host = setup(t, responses);
    const result = await host.run({
      action: "delivery-check",
      refs: [ref],
      conditions: { requiredChecks: ["CI"] },
    });
    assert.equal(result.isError, true, JSON.stringify(responses));
    assert.match(JSON.stringify(result.content), /unknown/);
    assert.equal(host.calls.length, responses.length);
    assert.ok(isReadOnly(host.calls));
  }
  const host = setup(
    t,
    Array.from({ length: 100 }, (_, index) =>
      page([{ ...check, id: `check-${index}` }], true, `cursor-${index}`),
    ),
  );
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requiredChecks: ["CI"] },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /100-page/);
  assert.equal(host.calls.length, 100);
  assert.ok(isReadOnly(host.calls));
});

test("every explicit PR is read and assessed without claiming whole-issue completion", async (t) => {
  const merged = page();
  Object.assign(merged.data.repository.pullRequest, {
    state: "MERGED",
    mergedAt: "2026-01-01T00:00:00Z",
    mergeCommit: { oid: "b".repeat(40) },
  });
  const other = page();
  other.data.repository.nameWithOwner = "other/repo";
  Object.assign(other.data.repository.pullRequest, {
    number: 2,
    url: "https://github.com/other/repo/pull/2",
  });
  const host = setup(t, [merged, other]);
  const refs = [ref, { repository: "other/repo", number: 2 }];
  const result = await host.run({
    action: "delivery-check",
    refs,
    conditions: { requireMerge: true, requiredChecks: ["CI"], targetBase: "main" },
  });
  assert.notEqual(result.isError, true);
  assert.equal(decoded(result).status, "pending");
  assert.deepEqual(
    decoded(result).observations.map((observation: { ref: unknown }) => observation.ref),
    refs,
  );
  assert.deepEqual(
    decoded(result)
      .conditions.filter((condition: { name: string }) => condition.name === "merge")
      .map((condition: { status: string }) => condition.status),
    ["satisfied", "pending"],
  );
  assert.equal(host.calls.length, 2);
  assert.ok(host.calls[1]?.args.includes("owner=other"));
  assert.ok(host.calls[1]?.args.includes("repo=repo"));
  assert.ok(host.calls[1]?.args.includes("number=2"));
  assert.ok(isReadOnly(host.calls));
});

test("direct PR reader validates refs before Exec and returns a complete read-only observation", async () => {
  const calls: { command: string; args: readonly string[] }[] = [];
  const exec: Exec = async (command, args) => {
    calls.push({ command, args });
    return { code: 0, stdout: JSON.stringify(page()), stderr: "" };
  };
  const invalid = await observePullRequest(
    { exec, cwd: "/unused" },
    { repository: "implicit", number: 1 },
  );
  assert.equal(invalid.ok, false);
  assert.deepEqual(calls, []);
  const result = await observePullRequest({ exec, cwd: "/unused" }, ref);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(result.value, {
    ref,
    url: "https://github.com/o/r/pull/1",
    headOid: head,
    base: "main",
    state: "open",
    draft: false,
    mergedAt: null,
    mergeOid: null,
    checks: [{ name: "CI", headOid: head, state: "success" }],
  });
  assert.equal(calls.length, 1);
  assert.ok(isReadOnly(calls));
});

test("terminal page cannot repeat a prior cursor even with distinct context IDs", async (t) => {
  const host = setup(t, [
    page([check], true, "next"),
    page([{ ...check, id: "check-2" }], false, "next"),
  ]);
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requiredChecks: ["CI"] },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /repeated cursor/);
  assert.equal(host.calls.length, 2);
  assert.ok(isReadOnly(host.calls));
});

test("a complete hundredth page is allowed but no extra read is attempted", async (t) => {
  const host = setup(
    t,
    Array.from({ length: 100 }, (_, index) =>
      page([{ ...check, id: `check-${index}` }], index < 99, `cursor-${index}`),
    ),
  );
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requiredChecks: ["CI"] },
  });
  assert.notEqual(result.isError, true);
  assert.equal(decoded(result).status, "satisfied");
  assert.equal(decoded(result).observations[0].checks.length, 100);
  assert.equal(host.calls.length, 100);
  assert.ok(isReadOnly(host.calls));
});

test("public reader preserves actionable API diagnostics without credential or terminal-control leakage", async (t) => {
  const host = setup(t, [], {
    code: 1,
    stdout: "",
    stderr:
      "permission denied ghp_notARealCredential123 Bearer private-value https://user:password@example.test/api\u001b[31m",
  });
  const result = await host.run({
    action: "delivery-check",
    refs: [ref],
    conditions: { requireMerge: true },
  });
  assert.equal(result.isError, true);
  const message = JSON.stringify(result.content);
  assert.match(message, /permission denied/);
  assert.doesNotMatch(message, /notARealCredential|private-value|password|\\u001b/);
  assert.ok(isReadOnly(host.calls));
});
