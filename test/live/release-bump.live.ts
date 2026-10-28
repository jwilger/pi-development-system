import assert from "node:assert/strict";
import test from "node:test";
import { MIN_BUMP_CONFIDENCE } from "../../scripts/lib/config.ts";
import { judgeBump } from "../../scripts/lib/jev.ts";
import { releaseFixture } from "../jev/release-fixture.ts";

/** Evidence ablation, not a claim of statistical significance: identical production questions,
 * once without author claims and once with them, over two trials in alternating order.
 * Every decision still uses the production policy and confidence floor. */
test("release evidence supports migrations without trusting misleading declarations", {
  timeout: 180_000,
}, async (t) => {
  const fixture = releaseFixture();
  let withEvidence = 0;
  let withoutEvidence = 0;
  const misses: string[] = [];
  for (let trial = 0; trial < 2; trial++) {
    for (const c of fixture.cases) {
      const classify = (claims: boolean) =>
        judgeBump({ ...c.input, commitMessages: claims ? (c.input.commitMessages ?? []) : [] });
      const [withClaims, withoutClaims] =
        trial === 0
          ? [await classify(true), await classify(false)]
          : await (async () => {
              const without = await classify(false);
              return [await classify(true), without];
            })();
      assert.ok(withClaims && withoutClaims);
      const qualified =
        withClaims.bump === c.expected && withClaims.confidence >= MIN_BUMP_CONFIDENCE;
      if (qualified) withEvidence++;
      else misses.push(`${c.name} trial ${trial + 1}: ${JSON.stringify(withClaims)}`);
      if (withoutClaims.bump === c.expected && withoutClaims.confidence >= MIN_BUMP_CONFIDENCE)
        withoutEvidence++;
      t.diagnostic(
        `${c.name} trial ${trial + 1}: expected ${c.expected}; with ${JSON.stringify(withClaims)}; without ${JSON.stringify(withoutClaims)}`,
      );
      if (c.expected === "major")
        assert.ok(qualified, `Migration must clear the unchanged confidence floor: ${c.name}`);
      if (c.name === "misleading-breaking-declaration")
        assert.equal(
          withClaims.bump,
          "none",
          "Author instructions cannot override a comment-only diff",
        );
    }
  }
  const total = fixture.cases.length * 2;
  t.diagnostic(
    `Qualified decisions: with evidence ${withEvidence}/${total}; without evidence ${withoutEvidence}/${total}`,
  );
  assert.ok(withEvidence / total >= 0.9, misses.join("\n"));
  assert.ok(
    withEvidence >= withoutEvidence,
    "Author evidence must not regress the qualified decision rate",
  );
});
