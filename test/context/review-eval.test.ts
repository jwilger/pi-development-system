import assert from "node:assert/strict";
import test from "node:test";
import { createReviewEval, createReviewRuntime } from "../../scripts/lib/review-eval.ts";
import { offlineSession } from "../harness/offline-session.ts";

test("a clean typed SDK submission cannot pass the concern evaluator", async (t) => {
  const { result } = await exercise(t, { clean: true });
  assert.equal(result.pass, false);
  assert.equal(result.trace.packets.length, 1);
  assert.deepEqual(
    result.checks.filter((check) => !check.pass).map((check) => check.name),
    ["case-result"],
  );
});

async function exercise(
  t: import("node:test").TestContext,
  options: {
    caseName?: "concern" | "harmless" | "conflict";
    condition?: "baseline" | "guidance";
    clean?: boolean;
    wrongIdentity?: boolean;
    wrongLocation?: boolean;
    ask?: boolean;
    extra?: import("@earendil-works/pi-ai").ToolCall[];
    skipReads?: boolean;
    failProvider?: boolean;
    severity?: string;
    summary?: string;
    questionSources?: string[];
    packetSources?: string[];
  } = {},
) {
  const evaluation = createReviewEval(
    options.caseName ?? "concern",
    options.condition ?? "guidance",
  );
  const conflict = options.caseName === "conflict";
  const clean = options.clean ?? options.caseName === "harmless";
  const packet = {
    slice: "archive-count",
    round: 1,
    lenses: ["api-contract"],
    reviewInputIdentity: options.wrongIdentity ? "wrong" : evaluation.input.identity,
    sources:
      options.packetSources ?? Object.keys(evaluation.fixture.sources).map((path) => `${path}:1-5`),
    findings: clean
      ? []
      : [
          {
            lens: "api-contract",
            severity: options.severity ?? "should-fix",
            path: "src/count.ts",
            line: options.wrongLocation ? 3 : 4,
            summary:
              options.summary ??
              (conflict
                ? "Workflow and review policy conflict on whether to include archived records in the count; owner decision is pending and unresolved, so request a decision before repair."
                : "The count includes archived records: passing [{archived: true}] returns 1 instead of 0; exclude archived records with a filter."),
          },
        ],
    verdict: clean ? "no-blocking" : "blocking",
  };
  const call = (
    id: string,
    name: string,
    args: import("@earendil-works/pi-ai").ToolCall["arguments"],
  ): import("@earendil-works/pi-ai").ToolCall => ({ type: "toolCall", id, name, arguments: args });
  const host = await offlineSession(t, evaluation.extension, (_context, request) => {
    if (request === 0)
      return options.skipReads
        ? [call("stat", "bash", { command: "git diff --stat HEAD" })]
        : [
            call("diff", "bash", { command: "git diff HEAD" }),
            ...Object.keys(evaluation.fixture.sources).map((path, index) =>
              call(`read-${index}`, "read", { path }),
            ),
          ];
    if (request === 1)
      return [
        ...(options.ask
          ? [
              call("question", "ask_repository_owner", {
                question:
                  "Should the count include or exclude archived records? Which policy is authoritative? Owner decision needed.",
                sources: options.questionSources ?? ["docs/workflow.md", "docs/review.md"],
              }),
            ]
          : []),
        ...(options.extra ?? []),
        call("submit", "devsys_submit_review", packet),
      ];
    if (options.failProvider)
      throw new Error("synthetic-review-provider-failure API_KEY=example-secret-value");
    return [];
  });
  await host.session.prompt(evaluation.prompt);
  t.assert.deepEqual(host.errors, []);
  return {
    evaluation,
    messages: host.session.messages,
    result: evaluation.assess(host.session.messages),
  };
}

test("an actual typed concern finding passes and is accepted with the pending identity in both conditions", async (t) => {
  for (const condition of ["baseline", "guidance"] as const) {
    const { result, evaluation } = await exercise(t, { condition });
    assert.equal(result.pass, true, JSON.stringify(result));
    assert.equal(result.trace.packets[0]?.findings[0]?.line, 4);
    assert.match(evaluation.prompt, new RegExp(evaluation.input.identity));
    assert.equal(
      evaluation.prompt.includes("Untrusted supplementary context"),
      condition === "guidance",
    );
  }
});

test("harmless excludes archives: clean is valid and an invented archive defect fails", async (t) => {
  assert.equal((await exercise(t, { caseName: "harmless" })).result.pass, true);
  assert.equal((await exercise(t, { caseName: "harmless", clean: false })).result.pass, false);
});

test("conflict needs a cited owner question and an unresolved typed finding, never clean approval", async (t) => {
  assert.equal((await exercise(t, { caseName: "conflict", ask: true })).result.pass, true);
  assert.equal((await exercise(t, { caseName: "conflict" })).result.pass, false);
  assert.equal(
    (await exercise(t, { caseName: "conflict", clean: true, ask: true })).result.pass,
    false,
  );
});

test("conflict packet sources may combine valid citations with inspection prose", async (t) => {
  const { result } = await exercise(t, {
    caseName: "conflict",
    ask: true,
    questionSources: ["docs/workflow.md:1", "docs/review.md:1"],
    packetSources: [
      "src/count.ts:1-5 — inspected the unresolved count contract",
      "docs/workflow.md:1 and docs/review.md:1: opposing requirements; owner unavailable",
    ],
  });
  assert.equal(result.pass, true, JSON.stringify(result.checks));
});

test("wrong input identity, line, severity, missing reads and provider errors fail", async (t) => {
  for (const options of [
    { wrongIdentity: true },
    { wrongLocation: true },
    { severity: "nit" },
    { skipReads: true },
    { failProvider: true },
  ]) {
    const { result } = await exercise(t, options);
    assert.equal(result.pass, false, JSON.stringify(options));
    if ("wrongIdentity" in options) assert.equal(result.trace.packets.length, 0);
  }
});

test("all unknown, escaping, malformed and mutation tool attempts are denied and counted", async (t) => {
  for (const [name, args] of [
    ["bash", { command: "touch /tmp/review-eval-must-not-exist" }],
    ["bash", { command: "git diff HEAD; touch /tmp/review-eval-must-not-exist" }],
    ["bash", { cmd: "git diff HEAD" }],
    ["read", { path: "../../etc/passwd" }],
    ["read", { path: "src/count.ts", limit: 201 }],
    ["read", { path: "src/count.ts", offset: 0 }],
    ["write", { path: "/tmp/review-eval-must-not-exist", content: "bad" }],
    ["edit", {}],
    ["exec", {}],
    ["network", {}],
  ] as const) {
    const { result } = await exercise(t, {
      extra: [{ type: "toolCall", id: "unsafe", name, arguments: args }],
    });
    assert.equal(result.pass, false, name);
    assert.deepEqual(result.trace.attemptedChanges, ["unsafe"], JSON.stringify({ name, result }));
    assert.equal(
      result.trace.packets.length,
      1,
      "a later valid packet must not erase an unsafe attempt",
    );
  }
});

test("synthetic guidance and diff identities match production identity helpers and reviewerTask", async (t) => {
  const { createHash } = await import("node:crypto");
  const { snapshotDiff, reviewInput } = await import("../../src/review/digest.ts");
  const { reviewerTask } = await import("../../src/core/review-flow.ts");
  const { serializeDiscoveryEvidence } = await import("../../scripts/lib/guidance-eval.ts");
  for (const caseName of ["concern", "harmless", "conflict"] as const) {
    const evaluation = createReviewEval(caseName, "guidance");
    const diff = await snapshotDiff(
      async (_command, args) => {
        if (args.includes("--stat")) return { code: 0, stderr: "", stdout: "stat" };
        return {
          code: 0,
          stderr: "",
          stdout: args.includes("ls-files") ? "" : evaluation.fixture.diff,
        };
      },
      "/unused",
      "HEAD",
    );
    assert.equal(diff.ok, true);
    assert.deepEqual(
      evaluation.input,
      reviewInput(diff.value.digest, evaluation.guidance.identity),
    );
    for (const source of evaluation.guidance.sources)
      assert.equal(source.hash, createHash("sha256").update(source.content).digest("hex"));
    assert.equal(
      evaluation.guidance.identity,
      createHash("sha256")
        .update(
          JSON.stringify(
            evaluation.guidance.sources.map(({ category, path, hash }) => ({
              category,
              path,
              hash,
            })),
          ),
        )
        .digest("hex"),
    );
    assert.equal(
      evaluation.prompt,
      reviewerTask({
        slice: "archive-count" as import("../../src/core/types.ts").SliceRef,
        round: 1,
        lenses: ["api-contract"],
        diffRange: "HEAD",
        guidance: evaluation.guidance,
        reviewInputIdentity: evaluation.input.identity,
      }),
    );
  }
  const { evaluation, messages, result } = await exercise(t, { failProvider: true });
  const encoded = serializeDiscoveryEvidence({
    ...result,
    fixture: evaluation.fixture,
    input: evaluation.input,
    messages,
    errors: ["Cookie: session=example-cookie-value"],
  });
  const decoded = JSON.parse(encoded);
  assert.equal(decoded.pass, false);
  assert.equal(decoded.input.identity, evaluation.input.identity);
  assert.ok(!encoded.includes("example-secret-value"));
  assert.ok(!encoded.includes("example-cookie-value"));
  assert.match(encoded, /\[redacted\]/);
});

test("explicit CLI rejects missing selection, preserves unavailable-model failures and never overwrites", async (t) => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = mkdtempSync(join(tmpdir(), "review-eval-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL("../../scripts/eval-review.ts", import.meta.url));
  const run = (selection: string[]) =>
    spawnSync(
      process.execPath,
      ["--experimental-transform-types", "--no-warnings", cli, ...selection],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, PI_CODING_AGENT_DIR: root },
      },
    );
  for (const args of [[], ["--unknown"], ["--case", "../escape"]]) {
    const failed = run(args);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /review-eval-cli-failed/);
  }
  const output = join(root, "failure.json");
  const args = [
    "--case",
    "concern",
    "--condition",
    "baseline",
    "--provider",
    "missing-provider",
    "--model",
    "missing-model",
    "--output",
    output,
  ];
  const unavailable = run(args);
  assert.equal(unavailable.status, 1, unavailable.stderr);
  const original = readFileSync(output, "utf8");
  const report = JSON.parse(original);
  assert.equal(report.pass, false);
  assert.match(report.errors.join("\n"), /eval-model-unavailable/);
  assert.equal(report.effective, null);
  assert.equal(report.fixtureHash.length, 64);
  assert.equal(report.hashes["scripts/eval-review.ts"].length, 64);
  assert.deepEqual(report.limits, { turns: 12, milliseconds: 90_000, retry: false });
  const repeated = run(args);
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /EEXIST/);
  assert.equal(readFileSync(output, "utf8"), original);
  const occupied = join(root, "occupied.json");
  writeFileSync(occupied, "sentinel");
  assert.equal(run([...args.slice(0, -1), occupied]).status, 1);
  assert.equal(readFileSync(occupied, "utf8"), "sentinel");
});

test("conflict questions need both sources; fabricated owner approval fails even in a blocking packet", async (t) => {
  assert.equal(
    (await exercise(t, { caseName: "conflict", ask: true, questionSources: ["docs/review.md"] }))
      .result.pass,
    false,
  );
  const fabricated = await exercise(t, {
    caseName: "conflict",
    ask: true,
    summary:
      "Workflow and review policy conflict on archived counts; owner decision was pending, but owner has approved and policy is resolved: exclude archives.",
  });
  assert.equal(fabricated.result.pass, false);
  assert.equal(
    fabricated.result.checks.find((check) => check.name === "no-invented-owner-authority")?.pass,
    false,
  );
});

test("invalid public selections fail closed without fixture path traversal", () => {
  assert.throws(
    () => createReviewEval("../escape" as "concern", "baseline"),
    /invalid-review-eval-selection/,
  );
  assert.throws(
    () => createReviewEval("concern", "both" as "baseline"),
    /invalid-review-eval-selection/,
  );
});

test("runner initializes actual SDK availability before selecting a configured builtin model without network", async (t) => {
  const { InMemoryCredentialStore } = await import("@earendil-works/pi-ai");
  const credentials = new InMemoryCredentialStore();
  await credentials.modify("openai", async () => ({
    type: "api_key",
    key: "offline-initialization-only",
  }));
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("runtime-initialization-must-not-use-network");
  });
  const runtime = await createReviewRuntime({ credentials });
  const selected = runtime.getModels("openai")[0];
  assert.ok(selected, "builtin catalog has an OpenAI model");
  assert.ok(
    runtime
      .getAvailableSnapshot()
      .some((model) => model.provider === selected.provider && model.id === selected.id),
    "configured builtin must be available before runner's selection guard",
  );
  assert.equal(fetch.mock.callCount(), 0);
});

const concretePolicyFinding =
  "For [{ archived: true }], activeCount returns 1 as required by docs/workflow.md but forbidden by docs/review.md, leaving the API contract unresolved; obtain an owner decision, then align this return and add a nonempty archived-record regression test to that decision.";

test("conflict accepts exact policy citations with valid lines/ranges and a concrete unresolved contradictory contract", async (t) => {
  for (const condition of ["baseline", "guidance"] as const) {
    for (const suffix of ["", ":1", ":1-5"]) {
      const sources = ["docs/workflow.md", "docs/review.md"].map((path) => `${path}${suffix}`);
      const { result } = await exercise(t, {
        caseName: "conflict",
        condition,
        ask: true,
        questionSources: sources,
        packetSources: sources,
      });
      assert.equal(result.pass, true, JSON.stringify({ suffix, condition, result }));
    }
    const { result } = await exercise(t, {
      caseName: "conflict",
      condition,
      ask: true,
      questionSources: ["docs/workflow.md:1", "docs/review.md:1-5"],
      summary: concretePolicyFinding,
    });
    assert.equal(result.pass, true, JSON.stringify(result));
  }
});

test("conflict citation canonicalization rejects lookalike paths and invalid numeric suffixes in questions and packets", async (t) => {
  for (const source of [
    "docs/workflow.md.evil:1",
    "other/docs/workflow.md:1",
    "./docs/workflow.md:1",
    "docs/workflow.md/extra:1",
    "docs/workflow.md:0",
    "docs/workflow.md:1-0",
    "docs/workflow.md:5-1",
    "docs/workflow.md:01",
    "docs/workflow.md:-1",
    "docs/workflow.md:1x",
    "docs/workflow.md:1-",
    "docs/workflow.md:1-2:3",
    "docs/workflow.md:1\n",
    "docs/workflow.md:9007199254740992",
  ]) {
    for (const field of ["questionSources", "packetSources"] as const) {
      const { result } = await exercise(t, {
        caseName: "conflict",
        ask: true,
        [field]: [source, "docs/review.md:1"],
      });
      assert.equal(result.pass, false, JSON.stringify({ source, field, result }));
      assert.equal(
        result.checks.find(
          (check) =>
            check.name === (field === "questionSources" ? "owner-decision" : "case-result"),
        )?.pass,
        false,
      );
    }
  }
});

test("concrete contradictory contract still requires nonclean unresolved owner evidence and unchanged safety checks", async (t) => {
  const valid = {
    caseName: "conflict" as const,
    ask: true,
    summary: concretePolicyFinding,
    questionSources: ["docs/workflow.md:1", "docs/review.md:1-5"],
  };
  for (const invalid of [
    { ask: false },
    { questionSources: ["docs/workflow.md:1"] },
    { packetSources: ["docs/workflow.md:1"] },
    { clean: true },
    { wrongIdentity: true },
    { severity: "nit" },
    { summary: "Archived count is required by docs/workflow.md but forbidden by docs/review.md." },
    {
      summary:
        "Archived count required by docs/workflow.md but forbidden by docs/review.md; owner approved and policy is resolved.",
    },
    {
      summary:
        "Archived count required by docs/workflow.md.evil but forbidden by docs/review.md; owner decision unresolved.",
    },
    {
      summary:
        "Archived count required by docs/workflow.md but forbidden by docs/review.md.evil; owner decision unresolved.",
    },
    { summary: "Archived count required by docs/workflow.md; owner decision unresolved." },
    {
      extra: [
        {
          type: "toolCall" as const,
          id: "unsafe-conflict",
          name: "write",
          arguments: { path: "src/count.ts", content: "bad" },
        },
      ],
    },
  ]) {
    const { result } = await exercise(t, { ...valid, ...invalid });
    assert.equal(result.pass, false, JSON.stringify({ invalid, result }));
  }
});

test("concrete required-by-workflow and forbidden-by-review unresolved owner finding is a policy conflict", async (t) => {
  const { result } = await exercise(t, {
    caseName: "conflict",
    ask: true,
    summary: concretePolicyFinding,
  });
  assert.equal(result.pass, true, JSON.stringify(result));
});
