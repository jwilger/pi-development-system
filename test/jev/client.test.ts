import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import type { ClassifierResult, Usage } from "@earendil-works/pi-ai";
import { defaultMatrix } from "../../src/core/models.ts";
import {
  type ClassifierRegistry,
  createJev,
  type JevAskOptions,
  resolveJevModel,
} from "../../src/jev/client.ts";
import { DEFAULT_JEV_CANDIDATES } from "../../src/jev/models.ts";

type Model = ReturnType<ClassifierRegistry["findOfType"]>;

const fakeModel = (provider: string, id: string) =>
  ({
    provider,
    id,
    type: "classifier",
    api: "typesafe-system-one",
    contextWindow: 1000,
  }) as unknown as NonNullable<Model>;

const result = (over: Partial<ClassifierResult> = {}): ClassifierResult => ({
  api: "typesafe-system-one",
  provider: "typesafe",
  model: "jev-latest",
  answers: { q: { type: "bool", probability: 0.9 } },
  stopReason: "stop",
  timestamp: 0,
  ...over,
});

const registry = (opts: {
  models?: string[];
  authed?: boolean;
  classify?: (options?: { signal?: AbortSignal }) => Promise<ClassifierResult>;
}) => {
  const calls: unknown[] = [];
  const reg: ClassifierRegistry = {
    findOfType: (_t, provider, id) =>
      opts.models?.includes(`${provider}/${id}`) ? fakeModel(provider, id) : undefined,
    hasConfiguredAuth: () => opts.authed ?? true,
    classify: (_model, context, options) => {
      calls.push(context);
      return (opts.classify ?? (async () => result()))(options);
    },
  };
  return { reg, calls };
};

const usage: Usage = {
  input: 12,
  output: 3,
  cacheRead: 2,
  cacheWrite: 1,
  cacheWrite1h: 1,
  reasoning: 2,
  totalTokens: 18,
  cost: { input: 0.12, output: 0.03, cacheRead: 0.02, cacheWrite: 0.01, total: 0.18 },
};

const questions = {
  q: { type: "bool" as const, instructions: "?", criteria: { true: "a", false: "b" } },
};
const jevWith = (reg: ClassifierRegistry, over: { timeoutMs?: number } = {}) =>
  createJev({
    registry: reg,
    candidates: ["typesafe/jev-latest", "opencode/jev-1.13"],
    timeoutMs: over.timeoutMs ?? 1000,
    cache: new Map(),
    now: () => 0,
  });

test("a pre-aborted caller does not start a classifier request", async () => {
  const { reg, calls } = registry({ models: ["typesafe/jev-latest"] });
  const jev = jevWith(reg);
  const signal = AbortSignal.abort();
  assert.deepEqual(await jev.ask({}, questions, { signal }), {
    ok: false,
    error: { kind: "aborted" },
  });
  assert.equal(calls.length, 0);
  assert.equal(jev.availability(), "unknown");
});

test("caller cancellation bounds a provider that ignores abort without marking Jev offline", async () => {
  const caller = new AbortController();
  let received: AbortSignal | undefined;
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: (options) => {
      received = options?.signal;
      return new Promise(() => undefined);
    },
  });
  const jev = jevWith(reg, { timeoutMs: 50 });
  const pending = jev.ask({}, questions, { signal: caller.signal });
  caller.abort();
  assert.deepEqual(await pending, { ok: false, error: { kind: "aborted" } });
  assert.equal(received?.aborted, true);
  assert.equal(jev.availability(), "unknown");
});

test("reported usage belongs to the actual request, not subsequent cache hits", async () => {
  const { reg, calls } = registry({
    models: ["typesafe/jev-latest"],
    classify: async () => result({ usage }),
  });
  const jev = jevWith(reg);
  const reported: Usage[] = [];
  const options: JevAskOptions = { onUsage: (value) => reported.push(value) };
  assert.equal((await jev.ask({}, questions, options)).ok, true);
  assert.equal((await jev.ask({}, questions, options)).ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(reported, [usage]);
});

test("a shared cache never serves answers from a different resolved model", async () => {
  const cache = new Map<string, ClassifierResult>();
  const first = registry({ models: ["typesafe/jev-latest"] });
  const second = registry({ models: ["opencode/jev-1.13"] });
  const create = (reg: ClassifierRegistry) =>
    createJev({
      registry: reg,
      candidates: ["typesafe/jev-latest", "opencode/jev-1.13"],
      timeoutMs: 1000,
      cache,
      now: () => 0,
    });
  await create(first.reg).ask({}, questions);
  await create(second.reg).ask({}, questions);
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 1);
});

test("default classifier lists resolve the current OpenRouter alias", () => {
  const { reg } = registry({ models: ["openrouter/~typesafe/jev-latest"] });
  for (const candidates of [DEFAULT_JEV_CANDIDATES, defaultMatrix().jev]) {
    const resolved = resolveJevModel(reg, candidates);
    assert.equal(resolved?.provider, "openrouter");
    assert.equal(resolved?.id, "~typesafe/jev-latest");
  }
});

test("pre-aborted callers do not receive even a cached answer", async () => {
  const { reg, calls } = registry({ models: ["typesafe/jev-latest"] });
  const jev = jevWith(reg);
  await jev.ask({}, questions);
  assert.deepEqual(await jev.ask({}, questions, { signal: AbortSignal.abort() }), {
    ok: false,
    error: { kind: "aborted" },
  });
  assert.equal(calls.length, 1);
  assert.equal(jev.availability(), "online");
});

test("timeout stays distinct when the provider immediately responds to abort", async () => {
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: (options) =>
      new Promise((resolve) => {
        options?.signal?.addEventListener("abort", () =>
          resolve(result({ stopReason: "aborted" })),
        );
      }),
  });
  assert.deepEqual(await jevWith(reg, { timeoutMs: 10 }).ask({}, questions), {
    ok: false,
    error: { kind: "timeout" },
  });
});

test("concurrent callers have independent signals and usage collectors", async () => {
  const pending: Array<{
    signal: AbortSignal | undefined;
    resolve: (value: ClassifierResult) => void;
  }> = [];
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: (options) =>
      new Promise((resolve) => pending.push({ signal: options?.signal, resolve })),
  });
  const jev = jevWith(reg);
  const first = new AbortController();
  const second = new AbortController();
  const reported: Usage[][] = [[], []];
  const a = jev.ask({ request: 1 }, questions, {
    signal: first.signal,
    onUsage: (value) => reported[0]?.push(value),
  });
  const b = jev.ask({ request: 2 }, questions, {
    signal: second.signal,
    onUsage: (value) => reported[1]?.push(value),
  });
  first.abort();
  assert.deepEqual(await a, { ok: false, error: { kind: "aborted" } });
  assert.equal(pending[0]?.signal?.aborted, true);
  assert.equal(pending[1]?.signal?.aborted, false);
  pending[1]?.resolve(result({ usage }));
  assert.equal((await b).ok, true);
  // A late result must not write into a collector whose tool result has already finalized.
  pending[0]?.resolve(result({ usage }));
  await Promise.resolve();
  assert.deepEqual(reported, [[], [usage]]);
  assert.equal(getEventListeners(first.signal, "abort").length, 0);
  assert.equal(getEventListeners(second.signal, "abort").length, 0);
});

for (const stopReason of ["error", "aborted"] as const) {
  test(`reported usage is retained for a classifier ${stopReason} result`, async () => {
    const { reg } = registry({
      models: ["typesafe/jev-latest"],
      classify: async () => result({ stopReason, usage, errorMessage: "bad answers" }),
    });
    const reported: Usage[] = [];
    const asked = await jevWith(reg).ask({}, questions, {
      onUsage: (value) => reported.push(value),
    });
    assert.equal(asked.ok, false);
    assert.deepEqual(reported, [usage]);
  });
}

test("missing usage is not fabricated and no-model calls emit none", async () => {
  for (const models of [[], ["typesafe/jev-latest"]]) {
    const { reg } = registry({ models });
    const reported: Usage[] = [];
    await jevWith(reg).ask({}, questions, { onUsage: (value) => reported.push(value) });
    assert.deepEqual(reported, []);
  }
});

test("a failing usage callback becomes a typed error and does not cache the answer", async () => {
  const { reg, calls } = registry({
    models: ["typesafe/jev-latest"],
    classify: async () => result({ usage }),
  });
  const jev = jevWith(reg);
  assert.deepEqual(
    await jev.ask({}, questions, {
      onUsage: () => {
        throw new Error("collector unavailable");
      },
    }),
    { ok: false, error: { kind: "usage-recording", message: "collector unavailable" } },
  );
  assert.equal(jev.availability(), "unknown", "local accounting failure must not disable Jev");
  assert.equal((await jev.ask({}, questions)).ok, true);
  assert.equal(calls.length, 2);
});

test("settled requests release the caller signal and cancel their timeout", async () => {
  const caller = new AbortController();
  let providerSignal: AbortSignal | undefined;
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: async (options) => {
      providerSignal = options?.signal;
      return result();
    },
  });
  assert.equal(
    (await jevWith(reg, { timeoutMs: 10 }).ask({}, questions, { signal: caller.signal })).ok,
    true,
  );
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  caller.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(providerSignal?.aborted, false);
});

test("no authed classifier → no-model and offline without calling classify", async () => {
  const { reg, calls } = registry({ models: ["typesafe/jev-latest"], authed: false });
  const jev = jevWith(reg);
  const r = await jev.ask({ x: 1 }, questions);
  assert.deepEqual(r, { ok: false, error: { kind: "no-model" } });
  assert.equal(jev.availability(), "offline");
  assert.equal(calls.length, 0);
  assert.equal(jev.model(), undefined);
});

test("availability is unknown before the first ask", () => {
  const { reg } = registry({ models: ["typesafe/jev-latest"] });
  assert.equal(jevWith(reg).availability(), "unknown");
});

test("picks the first candidate that exists and has auth; identical asks are cached", async () => {
  const { reg, calls } = registry({ models: ["opencode/jev-1.13"] });
  const jev = jevWith(reg);
  const a = await jev.ask({ x: 1 }, questions);
  const b = await jev.ask({ x: 1 }, questions);
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  assert.equal(calls.length, 1);
  assert.equal(jev.availability(), "online");
  assert.equal(jev.model(), "opencode/jev-1.13");
});

test("different state is not served from the cache", async () => {
  const { reg, calls } = registry({ models: ["typesafe/jev-latest"] });
  const jev = jevWith(reg);
  await jev.ask({ x: 1 }, questions);
  await jev.ask({ x: 2 }, questions);
  assert.equal(calls.length, 2);
});

test("stopReason error → provider error and offline; errors are not cached", async () => {
  let n = 0;
  const { reg, calls } = registry({
    models: ["typesafe/jev-latest"],
    classify: async () =>
      n++ === 0 ? result({ stopReason: "error", errorMessage: "boom", answers: {} }) : result(),
  });
  const jev = jevWith(reg);
  assert.deepEqual(await jev.ask({}, questions), {
    ok: false,
    error: { kind: "provider", message: "boom" },
  });
  assert.equal(jev.availability(), "offline");
  assert.equal((await jev.ask({}, questions)).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(jev.availability(), "online");
});

test("stopReason aborted → aborted error", async () => {
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: async () => result({ stopReason: "aborted", answers: {} }),
  });
  assert.deepEqual(await jevWith(reg).ask({}, questions), {
    ok: false,
    error: { kind: "aborted" },
  });
});

test("a classify that never settles times out", async () => {
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: () => new Promise(() => undefined),
  });
  const jev = jevWith(reg, { timeoutMs: 20 });
  assert.deepEqual(await jev.ask({}, questions), { ok: false, error: { kind: "timeout" } });
  assert.equal(jev.availability(), "offline");
});

test("a classify that throws is reported as a provider error", async () => {
  const { reg } = registry({
    models: ["typesafe/jev-latest"],
    classify: async () => {
      throw new Error("net down");
    },
  });
  assert.deepEqual(await jevWith(reg).ask({}, questions), {
    ok: false,
    error: { kind: "provider", message: "net down" },
  });
});
