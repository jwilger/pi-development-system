import assert from "node:assert/strict";
import test from "node:test";
import {
  GUARDRAIL,
  lensPayloads,
  lensReviewScript,
  PRODUCT_LENSES,
  reviewPath,
  selectProductLenses,
  synthesisTemplate,
} from "../../src/review/lens-review.ts";

const input = {
  lenses: PRODUCT_LENSES,
  briefPath: "docs/product/brief.md",
  round: 1 as const,
  date: "2026-10-08",
  suffix: "abc",
  thinkingLevel: "high" as const,
};

test("the review file is dated and named by round", () => {
  assert.equal(reviewPath("2026-10-08", 1), "docs/product/reviews/2026-10-08-round1.md");
  assert.equal(reviewPath("2026-10-08", 2), "docs/product/reviews/2026-10-08-round2.md");
  assert.equal(
    reviewPath("2026-10-08", "synthesis"),
    "docs/product/reviews/2026-10-08-synthesis.md",
  );
});

test("one fresh spawn payload per lens, each of its own lens-* agent type", () => {
  const payloads = lensPayloads(input);
  assert.deepEqual(
    payloads.map((p) => p.type),
    ["lens-cagan", "lens-torres", "lens-pichler", "lens-perri", "lens-rumelt"],
  );
  assert.equal(new Set(payloads.map((p) => p.path)).size, 5);
  for (const p of payloads) assert.match(p.path, /^\/lens-r1-[a-z]+-abc$/);
});

test("every lens prompt carries the guardrail, the brief path and the packet format", () => {
  for (const p of lensPayloads(input)) {
    assert.ok(p.task.includes(GUARDRAIL), p.type);
    assert.ok(p.task.includes("docs/product/brief.md"), p.type);
    assert.match(p.task, /round 1/);
    assert.match(p.task, /Sources inspected/);
    assert.match(p.task, /independent/i);
  }
  assert.match(GUARDRAIL, /agreement among agents is useful critique, not customer evidence/i);
});

test("round 2 points each lens at the round 1 file and asks for a response to peers", () => {
  const [first] = lensPayloads({ ...input, round: 2 });
  assert.ok(first?.task.includes("docs/product/reviews/2026-10-08-round1.md"));
  assert.match(first?.task ?? "", /peer/i);
  assert.match(first?.task ?? "", /round 2/);
  assert.ok(first?.task.includes(GUARDRAIL));
  assert.match(first?.path ?? "", /^\/lens-r2-/);
});

test("a subset of lenses yields only those payloads", () => {
  assert.equal(lensPayloads({ ...input, lenses: ["rumelt", "cagan"] }).length, 2);
});

test("the script spawns all lenses detached before waiting, then writes one file", () => {
  const payloads = lensPayloads(input);
  const script = lensReviewScript({ payloads, file: reviewPath("2026-10-08", 1), round: 1 });
  assert.ok(script.indexOf("agent_spawn") < script.indexOf("agent_wait"));
  assert.match(script, /wait: false/);
  assert.ok(script.includes("docs/product/reviews/2026-10-08-round1.md"));
  assert.ok(script.includes("tools.write"));
  for (const p of payloads) assert.ok(script.includes(p.path));
});

test("the script is valid JavaScript for an async function body", () => {
  const script = lensReviewScript({
    payloads: lensPayloads(input),
    file: reviewPath("2026-10-08", 1),
    round: 1,
  });
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => unknown;
  assert.doesNotThrow(() => new AsyncFunction("tools", "text", script));
});

test("the script spawns, waits, writes and returns only verdict lines and the path", async () => {
  const payloads = lensPayloads(input);
  const calls: string[] = [];
  const written: Record<string, string> = {};
  const tools = {
    agent_spawn: async (a: { path: string; wait: boolean }) => {
      calls.push(`spawn ${a.path} wait=${a.wait}`);
      return "ok";
    },
    agent_wait: async (a: { path: string }) => {
      calls.push(`wait ${a.path}`);
      return "done";
    },
    // The real agent_output returns the JSON-encoded record, so newlines in the packet arrive escaped.
    agent_output: async (a: { path: string }) => {
      const verdict = a.path.includes("cagan") ? "blocking" : "no-blocking";
      const text = `## Review — x — round 1 — lenses: ${a.path}\n### Verdict\n${verdict}\n`;
      return JSON.stringify(
        { path: a.path, text, totalCharacters: text.length, nextOffset: null },
        null,
        2,
      );
    },
    write: async (a: { path: string; content: string }) => {
      written[a.path] = a.content;
      return "ok";
    },
  };
  const script = lensReviewScript({ payloads, file: reviewPath("2026-10-08", 1), round: 1 });
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (tools: unknown) => Promise<string>;
  const out = await new AsyncFunction("tools", script)(tools);
  assert.equal(calls.filter((c) => c.startsWith("spawn")).length, 5);
  assert.ok(calls.findIndex((c) => c.startsWith("wait")) > 4, "all spawned before the first wait");
  const file = String(written["docs/product/reviews/2026-10-08-round1.md"]);
  assert.match(file, /cagan/);
  assert.match(out, /cagan: blocking/);
  assert.match(out, /torres: no-blocking/);
  assert.match(out, /docs\/product\/reviews\/2026-10-08-round1\.md/);
  assert.ok(out.length < 600, "no packet text comes back");
});

test("a lens that fails to answer is reported, not dropped", async () => {
  const payloads = lensPayloads({ ...input, lenses: ["cagan", "torres"] });
  const tools = {
    agent_spawn: async () => "ok",
    agent_wait: async () => "done",
    agent_output: async (a: { path: string }) => {
      if (a.path.includes("cagan")) throw new Error("boom");
      return "### Verdict\nno-blocking";
    },
    write: async () => "ok",
  };
  const script = lensReviewScript({ payloads, file: reviewPath("2026-10-08", 1), round: 1 });
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (tools: unknown) => Promise<string>;
  const out = await new AsyncFunction("tools", script)(tools);
  assert.match(out, /cagan: no packet/);
  assert.match(out, /torres: no-blocking/);
});

test("only lenses at or above the threshold are selected", () => {
  const p = { cagan: 0.9, torres: 0.49, pichler: 0.5, perri: 0.1, rumelt: 0.8 };
  assert.deepEqual(selectProductLenses(p), ["cagan", "pichler", "rumelt"]);
});

test("the synthesis template has an R table and a one-question agenda", () => {
  const t = synthesisTemplate("2026-10-08");
  assert.match(t, /\| R\d* \|| R-id/);
  assert.match(t, /one question/i);
  assert.ok(t.includes(GUARDRAIL));
});

test("a packet longer than one agent_output page is read to the end, so its verdict is found", async () => {
  const payloads = lensPayloads({
    lenses: ["cagan"],
    briefPath: "docs/product/brief.md",
    round: 1,
    date: "2026-10-08",
    suffix: "t",
    thinkingLevel: "high",
  });
  const packet = `## Review — x — round 1\n${"finding line\n".repeat(3000)}### Verdict\nblocking\n`;
  const written: Record<string, string> = {};
  const tools = {
    agent_spawn: async () => "ok",
    agent_wait: async () => "done",
    agent_output: async (a: { limit?: number; offset?: number }) => {
      const offset = a.offset ?? 0;
      const limit = Math.min(a.limit ?? 8000, 16000);
      return JSON.stringify({
        text: packet.slice(offset, offset + limit),
        totalCharacters: packet.length,
        nextOffset: offset + limit < packet.length ? offset + limit : null,
      });
    },
    write: async (a: { path: string; content: string }) => {
      written[a.path] = a.content;
      return "ok";
    },
  };
  const script = lensReviewScript({ payloads, file: reviewPath("2026-10-08", 1), round: 1 });
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (tools: unknown) => Promise<string>;
  const out = await new AsyncFunction("tools", script)(tools);
  assert.match(out, /cagan: blocking/);
  assert.ok((written[reviewPath("2026-10-08", 1)] ?? "").includes("### Verdict\nblocking"));
});

test("each lens payload carries the effort it was given", () => {
  for (const p of lensPayloads({ ...input, thinkingLevel: "xhigh" })) {
    assert.equal(p.thinkingLevel, "xhigh");
  }
});
