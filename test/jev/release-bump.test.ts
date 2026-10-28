import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { judgeBump } from "../../scripts/lib/jev.ts";
import { releaseFixture } from "./release-fixture.ts";

test("the release classifier request contract matches its behavioral live evals", async (t) => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "offline-test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  });
  let contract: unknown;
  t.mock.method(
    TypeSafeClient.prototype,
    "systemOne",
    async (request: { state: { context: string }; questions: unknown }) => {
      contract = { context: request.state.context, questions: request.questions };
      return { answers: { breaking: { noul: 0 }, feature: { noul: 0 }, observable: { noul: 0 } } };
    },
  );
  const fixture = releaseFixture();
  const first = fixture.cases[0];
  assert.ok(first, "at least one behavioral case is required");
  await judgeBump(first.input);
  const hash = createHash("sha256").update(JSON.stringify(contract)).digest("hex").slice(0, 16);
  assert.equal(
    hash,
    fixture.contractHash,
    "Change the contract only with a successful live effect eval, then repin.",
  );
});
