import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Type } from "typebox";
import {
  acceptArchitectureReceipt,
  bindArchitectureReview,
} from "../../src/core/architecture-review.ts";
import type { Exec } from "../../src/core/exec.ts";
import { err, ok } from "../../src/core/result.ts";
import { type Finding, parseReviewState, type ReviewState } from "../../src/core/review.ts";
import type { SliceRef } from "../../src/core/types.ts";
import { registerArchitectureGuard } from "../../src/gates/architecture-guard.ts";
import type { Jev } from "../../src/jev/client.ts";
import { architectureReviewGap } from "../../src/review/architecture-evidence.ts";
import { createReviewRecordTool, createReviewStartTool } from "../../src/review/review-tools.ts";
import { createSubmissionStore } from "../../src/review/submissions.ts";
import { createSubmitReviewTool } from "../../src/review/submit-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createInheritedToolSource } from "../../src/subagents/orch/inherited-tools.ts";
import { createDriverFactory } from "../../src/subagents/orch/runtime.ts";
import {
  type InheritedToolCaller,
  runWithInheritedToolCaller,
} from "../../src/subagents/orch/tool-caller.ts";
import type { AgentDriver } from "../../src/subagents/types.ts";
import { createFakePi } from "../harness/fake-pi.ts";
import { offlineSession } from "../harness/offline-session.ts";

const id = (n: number) => n.toString(16).padStart(40, "0");
const bound = bindArchitectureReview({
  version: 1,
  boundary: "commit",
  adoption: { trunkRef: "refs/heads/main", adoptedAt: id(1) },
  authority: id(1),
  head: id(1),
  tree: id(2),
  source: [{ kind: "staged-tree", objectId: id(2) }],
  resulting: [{ kind: "staged-tree", objectId: id(2) }],
});
if (!bound.ok) throw new Error("Invalid architecture fixture binding");
const binding = bound.value;
const check = {
  status: "satisfied",
  explanation: "Inspected immutable authority and change; rationale matches.",
  sources: [{ objectId: id(2), path: "ARCHITECTURE.md", startLine: 1, endLine: 3 }],
};
const checks = {
  correspondence: check,
  currentAuthority: check,
  significance: check,
  rationalePreservation: check,
  reconsideration: check,
  sequentialIntroduction: check,
};
const evidence = {
  bindingIdentity: binding.identity,
  units: ["source", "resulting"].map((scope) => ({
    scope,
    unit: { kind: "staged-tree", objectId: id(2) },
    checks,
  })),
  findings: [],
  verdict: "no-blocking",
};
const args = {
  slice: "s1",
  round: 1,
  lenses: ["types"],
  sources: ["ARCHITECTURE.md:1-3"],
  findings: [],
  verdict: "no-blocking" as const,
  reviewInputIdentity: "input",
  architectureEvidence: evidence,
};

test("root SDK execution cannot submit plausible semantic evidence as the expected independent reviewer", async (t) => {
  const submissions = createSubmissionStore();
  const host = await offlineSession(
    t,
    (pi) => {
      const state = createSessionState(pi);
      pi.on("session_start", (_event, ctx) => {
        state.update((s) => ({
          ...s,
          activeSlice: "s1" as SliceRef,
          reviews: [
            {
              slice: "s1" as SliceRef,
              required: 1,
              rounds: [],
              pending: {
                round: 1,
                range: "HEAD",
                input: { diffDigest: "d", guidanceIdentity: "g", identity: "input" },
                architecture: {
                  binding,
                  expected: {
                    rootId: ctx.sessionManager.getSessionId(),
                    threadPath: "/review-independent",
                    attemptId: "issued",
                  },
                },
              },
            },
          ],
        }));
      });
      pi.registerTool(createSubmitReviewTool({ state, submissions }));
    },
    (_ctx, request) =>
      request === 0
        ? [{ type: "toolCall", id: "root-forgery", name: "devsys_submit_review", arguments: args }]
        : [],
  );
  await host.session.prompt("Submit the plausible evidence from the coordinator.");
  assert.deepEqual(host.errors, []);
  const result = host.session.messages.find(
    (m) => m.role === "toolResult" && m.toolName === "devsys_submit_review",
  );
  assert.ok(result?.role === "toolResult");
  assert.equal(
    result.isError,
    true,
    "root execution must refuse architecture approval rather than acknowledge semantic submission",
  );
  assert.match(JSON.stringify(result.content), /reviewer-origin-mismatch/);
  assert.equal(
    submissions.forRound("s1", 1, "input").length,
    1,
    "ordinary findings must survive refusal of semantic credit",
  );
});

// The external Git boundary supplies full immutable objects; all inspection and semantic logic is real.

const architectureText =
  "# Architecture\n\nThe shell performs I/O; the core makes pure decisions.\n";
function gitFixture() {
  let tree = id(2);
  let head = id(1);
  const revision = (ref: string | undefined) => {
    if (ref?.endsWith("^{tree}")) return tree;
    return ref?.startsWith("HEAD") ? head : id(1);
  };
  const listing = (path: string | undefined) =>
    path === ".development-system.toml"
      ? `100644 blob ${id(5)}\t.development-system.toml\0`
      : `100644 blob ${id(3)}\tARCHITECTURE.md\0`;
  const blob = (operation: string | undefined, hash: string | undefined) => {
    const content =
      hash === id(5)
        ? `[architecture]\ntrunk_ref = "refs/heads/main"\nadopted_at = "${id(1)}"\n`
        : architectureText;
    return operation === "-s" ? String(content.length) : content;
  };
  const exec: Exec = async (_command, gitArgs) => {
    const a = gitArgs[0] === "--no-replace-objects" ? gitArgs.slice(1) : gitArgs;
    let stdout = "";
    if (a.includes("--git-path")) stdout = "missing-grafts";
    else if (a.includes("--is-shallow-repository")) stdout = "false";
    else if (a[0] === "rev-parse") stdout = revision(a.at(-1));
    else if (a[0] === "write-tree") stdout = tree;
    else if (a[0] === "ls-tree") stdout = listing(a.at(-1));
    else if (a[0] === "cat-file") stdout = blob(a[1], a.at(-1));
    else if (
      !(
        ["merge-base", "rev-list", "log"].includes(a[0] ?? "") ||
        a.includes("diff") ||
        a.includes("ls-files")
      )
    )
      throw new Error(`Unexpected Git: ${a.join(" ")}`);
    return { code: 0, stdout, stderr: "" };
  };
  return {
    exec,
    changeTree: () => {
      tree = id(4);
    },
    changeHead: () => {
      head = id(6);
    },
  };
}
const resultText = (r: { content: readonly { type: string }[] }) =>
  r.content.map((c) => ("text" in c ? c.text : "")).join("\n");

for (const boundary of ["commit", "delivery"] as const) {
  for (const independent of [true, false]) {
    test(
      independent
        ? `a dispatched independent SDK reviewer submits, records and reloads complete exact ${boundary} evidence despite an empty working diff`
        : `an unrelated actual SDK child is refused and recorded without ${boundary} semantic credit`,
      async (t) => {
        const fixture = gitFixture();
        const submissions = createSubmissionStore();
        let child: AgentDriver | undefined;
        let secondChild: AgentDriver | undefined;
        let state: ReturnType<typeof createSessionState> | undefined;
        let pending: NonNullable<ReviewState["pending"]> | undefined;
        let handoff = "";
        let recorded = "";
        let commitExecutions = 0;
        const host = await offlineSession(
          t,
          (pi) => {
            state = createSessionState(pi);
            const owned = state;
            registerArchitectureGuard({ pi, state: owned, exec: fixture.exec });
            pi.registerTool({
              name: "bash",
              label: "Fixture transport",
              description: "Observed commit transport",
              parameters: Type.Object({ command: Type.String() }),
              async execute() {
                commitExecutions += 1;
                return {
                  content: [{ type: "text", text: "transport reached" }],
                  details: undefined,
                };
              },
            });
            const source = createInheritedToolSource(pi);
            const deps = {
              state: owned,
              submissions,
              exec: fixture.exec,
              jev: () => ({
                ask: async () => err({ kind: "no-model" as const }),
                availability: () => "offline" as const,
                model: () => undefined,
              }),
            };
            pi.on("session_start", () =>
              owned.update((s) => ({ ...s, activeSlice: "s1" as SliceRef })),
            );
            pi.registerTool(createSubmitReviewTool({ state: owned, submissions }));
            pi.registerTool({
              name: "prepare_child",
              label: "Prepare",
              description: "Prepare reviewer",
              parameters: Type.Object({}),
              prepareLoadout: source.captureLoadout,
              async execute(_id, _args, _signal, _update, ctx) {
                source.captureContext(ctx);
                const started = await createReviewStartTool(deps).execute(
                  "start",
                  { architectureBoundary: boundary },
                  undefined,
                  undefined,
                  ctx,
                );
                handoff = resultText(started);
                if (started.isError) return started;
                pending = owned.get().reviews?.[0]?.pending;
                const payloads = JSON.parse(handoff.split("\n").at(-1) ?? "null");
                assert.equal(payloads.length, 2);
                assert.notEqual(payloads[0].path, payloads[1].path);
                const payload = payloads[0];
                const factory = createDriverFactory(
                  () => ctx,
                  () => "use-current",
                  () => "allowed",
                  source.snapshot,
                );
                child = await factory({
                  path: independent ? payload.path : "/review-unrelated-sdk",
                  parentPath: null,
                  type: {
                    name: "reviewer",
                    description: "Fixture reviewer",
                    systemPrompt: payload.task,
                    tools: { allow: ["devsys_submit_review"] },
                    spawnOverrides: { model: "offline-devsys/pinned", thinkingLevel: "off" },
                  },
                  inherited: [],
                  tools: [],
                  signal: new AbortController().signal,
                  shouldPause: () => false,
                  onEvent: () => undefined,
                });
                secondChild = await factory({
                  path: payloads[1].path,
                  parentPath: null,
                  type: {
                    name: "reviewer",
                    description: "Second lens reviewer",
                    systemPrompt: payloads[1].task,
                    tools: { allow: ["devsys_submit_review"] },
                    spawnOverrides: { model: "offline-devsys/pinned", thinkingLevel: "off" },
                  },
                  inherited: [],
                  tools: [],
                  signal: new AbortController().signal,
                  shouldPause: () => false,
                  onEvent: () => undefined,
                });
                return { content: [{ type: "text", text: "prepared" }], details: undefined };
              },
            });
            pi.registerTool({
              name: "record_now",
              label: "Record",
              description: "Record round",
              parameters: Type.Object({}),
              async execute(_id, _args, _signal, _update, ctx) {
                assert.ok(pending);
                const result = await createReviewRecordTool(deps).execute(
                  "record",
                  {
                    diffDigest: pending.input.diffDigest,
                    reviewInputIdentity: pending.input.identity,
                  },
                  undefined,
                  undefined,
                  ctx,
                );
                recorded = resultText(result);
                return result;
              },
            });
          },
          (_ctx, request) => {
            if (request === 0)
              return [{ type: "toolCall", id: "prepare", name: "prepare_child", arguments: {} }];
            if (request === 2) {
              assert.ok(pending?.architecture);
              return [
                {
                  type: "toolCall",
                  id: "submit",
                  name: "devsys_submit_review",
                  arguments: {
                    ...args,
                    reviewInputIdentity: pending.input.identity,
                    architectureEvidence: {
                      ...evidence,
                      bindingIdentity: pending.architecture.binding.identity,
                      units: (["source", "resulting"] as const).flatMap(
                        (scope) =>
                          pending?.architecture?.binding[scope].map((unit) => ({
                            scope,
                            unit,
                            checks,
                          })) ?? [],
                      ),
                    },
                  },
                },
              ];
            }
            if (request === 6) {
              assert.ok(pending);
              return [
                {
                  type: "toolCall",
                  id: "second-lens",
                  name: "devsys_submit_review",
                  arguments: {
                    slice: "s1",
                    round: 1,
                    lenses: ["tests"],
                    sources: ["ARCHITECTURE.md:1-3"],
                    findings: [],
                    verdict: "no-blocking",
                    reviewInputIdentity: pending.input.identity,
                  },
                },
              ];
            }
            if (request === 4 || request === 8)
              return [
                { type: "toolCall", id: `record-${request}`, name: "record_now", arguments: {} },
              ];
            if (request === 10 || request === 12)
              return [
                {
                  type: "toolCall",
                  id: `commit-${request}`,
                  name: "bash",
                  arguments: {
                    command:
                      boundary === "commit"
                        ? "git commit -m 'feat: preserve architecture because requirements are authoritative'"
                        : "git push origin HEAD:main",
                  },
                },
              ];
            return [];
          },
          (root) => {
            writeFileSync(
              join(root, ".development-system.toml"),
              `[architecture]\ntrunk_ref = "refs/heads/main"\nadopted_at = "${id(1)}"\n[review]\nrequired_clean_rounds = 1\nmin_rounds = 1\n`,
            );
            return root;
          },
        );
        t.after(() => {
          child?.dispose();
          secondChild?.dispose();
        });
        await host.session.prompt("Prepare an independent review.");
        assert.ok(child, handoff);
        assert.ok(
          pending?.architecture,
          "pending binding and issued attempt must exist before spawn",
        );
        assert.match(handoff, /currentAuthority/);
        await child.prompt("Submit the exact-bound semantic evidence.");
        const submitted = submissions.forRound("s1", 1, pending.input.identity)[0];
        assert.ok(submitted?.architecture, JSON.stringify(child.snapshot()));
        if (independent)
          assert.ok(submitted.architecture.receipt, JSON.stringify(child.snapshot()));
        else {
          assert.equal(submitted.architecture.receipt, undefined);
          assert.match(submitted.architecture.refusal ?? "", /reviewer-origin-mismatch/);
        }
        assert.equal(submitted.architecture.origin?.sessionFile, child.sessionFile);
        await host.session.prompt("Try recording before the other lens returns.");
        assert.match(recorded, /incomplete-review/);
        assert.equal(state?.get().reviews?.[0]?.rounds.length, 0);
        assert.ok(secondChild);
        await secondChild.prompt("Submit only your assigned tests lens.");
        const secondResult = submissions
          .forRound("s1", 1, pending.input.identity)
          .find((p) => p.lenses.includes("tests"));
        assert.ok(secondResult);
        assert.equal(
          secondResult.architecture,
          undefined,
          "ordinary lens must not create a semantic refusal or approval",
        );
        await host.session.prompt("Record both submitted results.");
        assert.match(recorded, /Round 1 recorded/);
        const review = state?.get().reviews?.[0];
        assert.ok(review?.rounds[0]?.architecture);
        if (independent) {
          assert.equal(
            review.rounds[0].architecture.submissions[0]?.receipt?.origin.sessionFile,
            child.sessionFile,
          );
          assert.equal(architectureReviewGap(review, pending.architecture.binding), undefined);
        } else {
          assert.ok(review.rounds[0].findings.some((f) => f.severity === "blocking"));
          assert.match(
            architectureReviewGap(review, pending.architecture.binding) ?? "",
            /semantic evidence/,
          );
        }
        const reloaded = parseReviewState(JSON.parse(JSON.stringify(review)));
        assert.ok(!("kind" in reloaded), JSON.stringify(reloaded));
        assert.deepEqual(reloaded, review);
        await host.session.prompt("Try the reviewed commit through the Pi action boundary.");
        assert.equal(commitExecutions, independent ? 1 : 0);
        fixture.changeTree();
        await host.session.prompt("Try committing a changed staged tree without new review.");
        assert.equal(
          commitExecutions,
          independent ? 1 : 0,
          "changed staging must never reuse semantic credit",
        );
        const commitResults = host.session.messages.flatMap((m) =>
          m.role === "toolResult" && m.toolName === "bash" ? [m] : [],
        );
        assert.equal(commitResults.length, 2);
        assert.equal(commitResults[0]?.isError === true, !independent);
        assert.equal(commitResults[1]?.isError, true);
        assert.deepEqual(host.errors, []);
      },
    );
  }
}

function fixtureTools(t: TestContext) {
  const cwd = mkdtempSync(join(tmpdir(), "architecture-review-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const configure = (required = 1, adopt = true) =>
    writeFileSync(
      join(cwd, ".development-system.toml"),
      `${adopt ? `[architecture]\ntrunk_ref = "refs/heads/main"\nadopted_at = "${id(1)}"\n` : ""}[review]\nrequired_clean_rounds = ${required}\nmin_rounds = 1\n`,
    );
  configure();
  const fake = createFakePi({ cwd });
  Object.assign(fake.ctx.sessionManager, { getSessionId: () => "root" });
  const ctx = {
    ...fake.ctx,
    tools: [],
    executeTool: async () => {
      throw new Error("Nested execution is not used by review tools.");
    },
  };
  const state = createSessionState(fake.api);
  state.update((s) => ({ ...s, activeSlice: "s1" as SliceRef }));
  const git = gitFixture();
  const submissions = createSubmissionStore();
  const deps = {
    state,
    submissions,
    exec: git.exec,
    jev: (): Jev => ({
      ask: async (_input, questions) =>
        ok(
          Object.fromEntries(
            Object.keys(questions).map((key) => [
              key,
              { type: "bool" as const, probability: key === "types" ? 1 : 0 },
            ]),
          ),
        ),
      availability: () => "online" as const,
      model: () => "fixture/jev",
    }),
  };
  const start = (
    params: {
      restart?: boolean;
      architectureBoundary?: "commit" | "delivery";
      resulting?: string[];
    } = {},
  ) => createReviewStartTool(deps).execute("start", params, undefined, undefined, ctx);
  const pending = () => {
    const p = state.get().reviews?.[0]?.pending;
    if (p?.architecture === undefined) throw new Error("Expected prepared architecture review");
    return p;
  };
  const record = (packets?: string[]) => {
    const p = pending();
    return createReviewRecordTool(deps).execute(
      "record",
      {
        diffDigest: p.input.diffDigest,
        reviewInputIdentity: p.input.identity,
        ...(packets === undefined ? {} : { packets }),
      },
      undefined,
      undefined,
      ctx,
    );
  };
  const caller = (): InheritedToolCaller => {
    const p = pending();
    if (p.architecture === undefined) throw new Error("Expected architecture dispatch");
    return {
      ...p.architecture.expected,
      sessionFile: "owned-reviewer.jsonl",
      parentPath: null,
      agentType: "reviewer",
    };
  };
  const submit = (
    host: InheritedToolCaller = caller(),
    semantic: unknown = evidence,
    findings: Finding[] = [],
  ) => {
    const p = pending();
    return runWithInheritedToolCaller(host, () =>
      createSubmitReviewTool(deps).execute(
        "submit",
        {
          ...args,
          findings,
          verdict: findings.some((f) => f.severity === "blocking" || f.severity === "should-fix")
            ? "blocking"
            : "no-blocking",
          round: p.round,
          reviewInputIdentity: p.input.identity,
          architectureEvidence: semantic,
        },
        undefined,
        undefined,
        ctx,
      ),
    );
  };
  return {
    ...git,
    configure,
    fake,
    ctx,
    state,
    submissions,
    deps,
    start,
    pending,
    record,
    caller,
    submit,
  };
}

for (const [name, changed] of [
  ["wrong root", { rootId: "another-root" }],
  ["unrelated child", { threadPath: "/review-unrelated" }],
  ["wrong or restored attempt", { attemptId: "not-issued" }],
  ["nested reviewer", { parentPath: "/worker" }],
  ["wrong agent type", { agentType: "worker" }],
] as const) {
  test(`${name} cannot approve but its host origin and ordinary findings survive refusal`, async (t) => {
    const f = fixtureTools(t);
    assert.equal((await f.start()).isError, false);
    const caller = { ...f.caller(), ...changed };
    const result = await f.submit(caller);
    assert.equal(result.isError, true);
    assert.match(resultText(result), /reviewer-origin-mismatch/);
    const kept = f.submissions.forRound("s1", 1, f.pending().input.identity)[0];
    assert.deepEqual(kept?.architecture?.evidence, evidence);
    assert.deepEqual(
      kept?.architecture?.origin,
      {
        rootId: caller.rootId,
        threadPath: caller.threadPath,
        attemptId: caller.attemptId,
        sessionFile: caller.sessionFile,
      },
      "host facts must survive denial, without becoming a receipt",
    );
    assert.equal(kept?.architecture?.receipt, undefined);
  });
}

const markdown = (severity = "none", round = 1) => `## Review — s1 — round ${round} — lenses: types
### Sources inspected
- ARCHITECTURE.md:1-3
### Findings
${severity === "none" ? "- none" : `- [${severity}] types \`ARCHITECTURE.md:1\` — ordinary implementation defect needs repair`}
### Verdict
${severity === "blocking" || severity === "should-fix" ? "blocking" : "no-blocking"}
`;

test("semantic refusal preserves full negative evidence and ordinary serious findings as an unclean persisted round", async (t) => {
  const f = fixtureTools(t);
  assert.equal((await f.start()).isError, false);
  const negative = {
    ...evidence,
    units: evidence.units.map((unit) => ({
      ...unit,
      checks: { ...unit.checks, correspondence: { ...check, status: "violated" } },
    })),
  };
  const result = await f.submit(f.caller(), negative, [
    {
      id: "ordinary",
      lens: "types",
      severity: "should-fix",
      path: "ARCHITECTURE.md",
      line: 1,
      summary: "Ordinary implementation defect needs repair.",
    },
  ]);
  assert.equal(result.isError, true);
  assert.match(resultText(result), /semantic-check-violated/);
  assert.equal((await f.record()).isError, false);
  const review = f.state.get().reviews?.[0];
  assert.ok(review);
  assert.ok(
    review.rounds[0]?.findings.some(
      (finding) => finding.lens === "types" && finding.severity === "should-fix",
    ),
  );
  assert.ok(
    review.rounds[0]?.findings.some(
      (finding) => finding.lens === "architecture" && finding.severity === "blocking",
    ),
  );
  assert.deepEqual(review.rounds[0]?.architecture?.submissions[0]?.evidence, negative);
  const reloaded = parseReviewState(JSON.parse(JSON.stringify(review)));
  assert.deepEqual(reloaded, review);
  assert.match(architectureReviewGap(review, binding) ?? "", /semantic evidence/);
  const retry = await f.start();
  assert.equal(
    retry.isError,
    true,
    "architecture extension must preserve existing unchanged-code finding refusal",
  );
  assert.match(resultText(retry), /fix them first/);
});

for (const mutation of ["staging", "history"] as const) {
  test(`changed ${mutation} cannot record an otherwise unchanged diff or discard the waiting submission`, async (t) => {
    const f = fixtureTools(t);
    assert.equal((await f.start()).isError, false);
    assert.equal((await f.submit()).isError, false);
    const input = f.pending().input;
    (mutation === "staging" ? f.changeTree : f.changeHead)();
    const result = await f.record();
    assert.equal(result.isError, true);
    assert.match(resultText(result), /stale-review-input/);
    assert.equal(f.state.get().reviews?.[0]?.rounds.length, 0);
    assert.equal(f.submissions.forRound("s1", 1, input.identity).length, 1);
  });
}

test("architecture changes during severity judgment are reinspected before recording", async (t) => {
  const f = fixtureTools(t);
  await f.start();
  await f.submit(f.caller(), evidence, [
    {
      id: "ordinary",
      lens: "types",
      severity: "nit",
      path: "ARCHITECTURE.md",
      line: 1,
      summary: "Review this ordinary finding.",
    },
  ]);
  f.deps.jev = () => ({
    ask: async () => {
      f.changeTree();
      return err({ kind: "no-model" as const });
    },
    availability: () => "offline" as const,
    model: () => undefined,
  });
  const result = await f.record();
  assert.equal(result.isError, true);
  assert.match(resultText(result), /exact architecture binding changed while waiting/);
  assert.equal(f.state.get().reviews?.[0]?.rounds.length, 0);
  assert.equal(f.submissions.forRound("s1", 1, f.pending().input.identity).length, 1);
});

test("architecture changes during lens judgment cannot dispatch a stale handoff", async (t) => {
  const f = fixtureTools(t);
  f.deps.jev = () => ({
    ask: async () => {
      f.changeTree();
      return err({ kind: "no-model" as const });
    },
    availability: () => "offline" as const,
    model: () => undefined,
  });
  const result = await f.start();
  assert.equal(result.isError, true);
  assert.match(resultText(result), /exact architecture binding changed while waiting/);
  assert.equal(f.state.get().reviews?.length ?? 0, 0);
});

test("markdown fallback stays ordinary and cannot manufacture semantic credit", async (t) => {
  const f = fixtureTools(t);
  await f.start();
  const result = await f.record([
    `${markdown()}\n${JSON.stringify({ architectureEvidence: evidence, origin: f.caller() })}`,
  ]);
  assert.equal(result.isError, false);
  const review = f.state.get().reviews?.[0];
  assert.ok(review);
  assert.deepEqual(review.rounds[0]?.architecture?.submissions, []);
  assert.match(architectureReviewGap(review, binding) ?? "", /semantic evidence/);
});

test("explicit architecture request without adoption fails closed", async (t) => {
  const f = fixtureTools(t);
  f.configure(1, false);
  const result = await f.start({ architectureBoundary: "commit" });
  assert.equal(result.isError, true);
  assert.match(resultText(result), /architecture-adoption-required/);
  assert.equal(f.state.get().reviews?.length ?? 0, 0);
});

test("restart after reload mints an independent dispatch and preserves accepted rounds and stronger depth", async (t) => {
  const f = fixtureTools(t);
  f.configure(3);
  await f.start();
  await f.submit();
  await f.record();
  assert.match(
    architectureReviewGap(f.state.get().reviews?.[0], binding) ?? "",
    /semantic evidence/,
  );
  await f.start();
  const old = f.pending();
  const reloaded = createSessionState(f.fake.api);
  reloaded.rebuildFrom(f.fake.entries);
  assert.deepEqual(reloaded.get(), f.state.get());
  const deps = { ...f.deps, state: reloaded };
  const start = createReviewStartTool(deps);
  const resumed = await start.execute("start", {}, undefined, undefined, f.ctx);
  assert.equal(resumed.isError, true);
  assert.match(resultText(resumed), /restart: true/);
  f.configure(1);
  const restarted = await start.execute("restart", { restart: true }, undefined, undefined, f.ctx);
  assert.equal(restarted.isError, false);
  const review = reloaded.get().reviews?.[0];
  assert.ok(review?.pending?.architecture && old.architecture);
  assert.equal(review.required, 3);
  assert.equal(review.rounds.length, 1);
  assert.equal(review.pending.round, 2);
  assert.notEqual(
    review.pending.architecture.expected.threadPath,
    old.architecture.expected.threadPath,
  );
  assert.notEqual(
    review.pending.architecture.expected.attemptId,
    old.architecture.expected.attemptId,
  );
  const identity = review.pending.input.identity;
  const oldAttempt = await runWithInheritedToolCaller(
    {
      ...old.architecture.expected,
      parentPath: null,
      agentType: "reviewer",
      sessionFile: "old-session",
    },
    () =>
      createSubmitReviewTool({ ...f.deps, state: reloaded }).execute(
        "old",
        { ...args, round: 2, reviewInputIdentity: identity },
        undefined,
        undefined,
        f.ctx,
      ),
  );
  assert.equal(oldAttempt.isError, true);
  assert.match(resultText(oldAttempt), /reviewer-origin-mismatch/);
});

test("clean semantic depth requires distinct exact-binding rounds and legacy interruptions reset it", async (t) => {
  const f = fixtureTools(t);
  f.configure(2);
  await f.start();
  await f.submit();
  await f.record();
  const first = f.state.get().reviews?.[0];
  assert.ok(first);
  assert.match(architectureReviewGap(first, binding) ?? "", /semantic evidence/);
  await f.start();
  await f.submit();
  await f.record();
  const second = f.state.get().reviews?.[0];
  assert.ok(second);
  assert.equal(architectureReviewGap(second, binding), undefined);
  const one = second.rounds[0];
  const two = second.rounds[1];
  assert.ok(one && two);
  assert.match(
    architectureReviewGap({ ...second, rounds: [one, { ...one, n: 2 }] }, binding) ?? "",
    /semantic evidence/,
  );
  const { architecture: _architecture, input: _input, ...legacy } = two;
  assert.match(
    architectureReviewGap(
      { ...second, rounds: [...second.rounds, { ...legacy, n: 3 }] },
      binding,
    ) ?? "",
    /semantic evidence/,
  );
});

test("first host session is pinned; replacement session and missing owned session cannot approve", async (t) => {
  const f = fixtureTools(t);
  await f.start();
  const caller = f.caller();
  assert.equal((await f.submit(caller)).isError, false);
  assert.equal(f.pending().architecture?.expected.sessionFile, caller.sessionFile);
  for (const sessionFile of ["replacement.jsonl", "", undefined]) {
    const result = await f.submit({ ...caller, sessionFile });
    assert.equal(result.isError, true);
    assert.match(resultText(result), /reviewer-origin-mismatch/);
    assert.equal(
      f.submissions.forRound("s1", 1, f.pending().input.identity)[0]?.architecture?.receipt,
      undefined,
    );
  }
});

test("persisted optional metadata is boundary parsed, not silently dropped or credited", async (t) => {
  const f = fixtureTools(t);
  await f.start();
  await f.submit();
  await f.record();
  const review = f.state.get().reviews?.[0];
  const round = review?.rounds[0];
  const metadata = round?.architecture;
  const submission = metadata?.submissions[0];
  assert.ok(review && round && metadata && submission?.receipt);
  for (const malformed of [
    null,
    [],
    "evidence",
    { ...metadata, binding: { ...metadata.binding, identity: "invented" } },
    { ...metadata, expected: { ...metadata.expected, threadPath: "/worker/review" } },
    { ...metadata, request: { kind: "commit", resulting: [id(2)] } },
    { ...metadata, submissions: [{ ...submission, sources: "not-an-array" }] },
    {
      ...metadata,
      submissions: [
        { ...submission, origin: { ...submission.origin, sessionFile: "forged.jsonl" } },
      ],
    },
    {
      ...metadata,
      submissions: [{ ...submission, receipt: { ...submission.receipt, evidence: {} } }],
    },
    {
      ...metadata,
      submissions: [{ ...submission, evidence: { ...evidence, bindingIdentity: "stale" } }],
    },
  ]) {
    const parsed = parseReviewState({ ...review, rounds: [{ ...round, architecture: malformed }] });
    assert.ok("kind" in parsed, JSON.stringify(malformed));
  }
  const absent = parseReviewState({ ...review, rounds: [{ ...round, architecture: undefined }] });
  assert.ok("kind" in absent, "architecture identity without its binding must refuse parsing");
});

test("guard gap distinguishes structural failure and rejects changed ordered result units", () => {
  const deliveryBound = bindArchitectureReview({
    ...binding,
    boundary: "delivery",
    source: [
      { kind: "commit", objectId: id(6) },
      { kind: "commit", objectId: id(7) },
    ],
    resulting: [
      { kind: "commit", objectId: id(6) },
      { kind: "commit", objectId: id(7) },
    ],
  });
  assert.ok(deliveryBound.ok);
  const b = deliveryBound.value;
  const origin = {
    rootId: "root",
    threadPath: "/review-ordered",
    attemptId: "attempt",
    sessionFile: "review.jsonl",
  };
  const scoped = {
    ...evidence,
    bindingIdentity: b.identity,
    units: (["source", "resulting"] as const).flatMap((scope) =>
      b[scope].map((unit) => ({ scope, unit, checks: evidence.units[0]?.checks })),
    ),
  };
  const accepted = acceptArchitectureReceipt(b, scoped, origin, origin);
  assert.ok(accepted.ok);
  const review: ReviewState = {
    slice: "s1" as SliceRef,
    required: 1,
    rounds: [
      {
        n: 1,
        lenses: ["types"],
        findings: [],
        reviewedAt: "now",
        diffDigest: "d",
        architecture: {
          binding: b,
          expected: origin,
          submissions: [
            { evidence: scoped, sources: args.sources, origin, receipt: accepted.value },
          ],
        },
      },
    ],
  };
  assert.equal(architectureReviewGap(review, b), undefined);
  const reordered = bindArchitectureReview({ ...b, resulting: [...b.resulting].reverse() });
  assert.ok(reordered.ok);
  assert.match(architectureReviewGap(review, reordered.value) ?? "", /semantic evidence/);
  assert.match(
    architectureReviewGap(review, { ...b, identity: "invented" }) ?? "",
    /structural failure/,
  );
  assert.match(architectureReviewGap(undefined, b) ?? "", /semantic evidence missing/);
});

test("delivery start persists its explicit result request and records against that same boundary", async (t) => {
  const f = fixtureTools(t);
  const started = await f.start({ architectureBoundary: "delivery", resulting: [] });
  assert.equal(started.isError, false, resultText(started));
  const p = f.pending();
  assert.ok(p.architecture);
  assert.equal(p.architecture.binding.boundary, "delivery");
  assert.deepEqual(p.architecture.request, { kind: "delivery", resulting: [] });
  const semantic = { ...evidence, bindingIdentity: p.architecture.binding.identity, units: [] };
  const submitted = await f.submit(f.caller(), semantic);
  assert.equal(submitted.isError, false, resultText(submitted));
  const recorded = await f.record();
  assert.equal(recorded.isError, false, resultText(recorded));
  assert.equal(
    architectureReviewGap(f.state.get().reviews?.[0], p.architecture.binding),
    undefined,
  );
});
