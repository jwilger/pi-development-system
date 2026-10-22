import assert from "node:assert/strict";
import test from "node:test";
import { estimateRequestTokens, fitsWindow } from "../../src/core/context-fit.ts";

test("a request costs the subagent overhead plus a quarter token per task character and file byte", () => {
  assert.equal(estimateRequestTokens({ taskChars: 0, fileBytes: 0 }), 8000);
  assert.equal(estimateRequestTokens({ taskChars: 5, fileBytes: 0 }), 8002);
  assert.equal(estimateRequestTokens({ taskChars: 4, fileBytes: 9 }), 8004);
});

test("a request fits when it uses at most 60% of the window", () => {
  assert.equal(fitsWindow(19_660, 32_768), true);
  assert.equal(fitsWindow(19_661, 32_768), false);
});

test("a model whose window is unknown always fits", () => {
  assert.equal(fitsWindow(10_000_000, undefined), true);
});
