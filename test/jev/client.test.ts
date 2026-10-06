import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierResult } from "@earendil-works/pi-ai";
import { type ClassifierRegistry, createJev } from "../../src/jev/client.ts";

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
  classify?: () => Promise<ClassifierResult>;
}) => {
  const calls: unknown[] = [];
  const reg: ClassifierRegistry = {
    findOfType: (_t, provider, id) =>
      opts.models?.includes(`${provider}/${id}`) ? fakeModel(provider, id) : undefined,
    hasConfiguredAuth: () => opts.authed ?? true,
    classify: (model, context) => {
      calls.push(context);
      return (opts.classify ?? (async () => result()))();
    },
  };
  return { reg, calls };
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
