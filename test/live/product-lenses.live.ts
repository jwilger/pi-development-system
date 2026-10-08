import assert from "node:assert/strict";
import test from "node:test";
import { judgeProductLenses } from "../../src/jev/questions/product-lenses.ts";
import { PRODUCT_LENSES, selectProductLenses } from "../../src/review/lens-review.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("product-lens fixture: per-lens accuracy ≥ 0.8 with a real Jev", async () => {
  const jev = await realJev();
  let right = 0;
  let total = 0;
  const misses: string[] = [];
  for (const c of loadFixture("product-lenses").cases) {
    const r = await judgeProductLenses(jev, { brief: c.state.brief ?? "" });
    const expected = new Set(c.expected.split(",").filter(Boolean));
    for (const lens of PRODUCT_LENSES) {
      total++;
      const picked = r.ok && selectProductLenses(r.value).includes(lens);
      if (picked === expected.has(lens)) right++;
      else
        misses.push(`${lens} ${picked ? "picked" : "skipped"} for ${c.state.brief?.slice(0, 50)}`);
    }
  }
  assert.equal(rateShortfall(right, total, 0.8, misses), undefined);
});
