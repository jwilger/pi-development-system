import assert from "node:assert/strict";
import test from "node:test";
import { createDevelopmentSystem } from "../extensions/development-system.ts";
import { createFakePi } from "./harness/fake-pi.ts";

// Which tools the model sees directly, which only through a codemode script, and which it must
// never be able to call from a script (they ask the user or change the workflow).
const EXPOSURE: Record<string, string> = {
  devsys_record_departure: "direct",
  devsys_review_record: "direct",
  devsys_adr_new: "direct",
  devsys_finish_slice: "model-only",
  devsys_lens_review: "direct",
  devsys_request_approval: "model-only",
  devsys_intake: "model-only",
  devsys_begin_work: "model-only",
  devsys_review_start: "model-only",
  devsys_work_item: "codemode",
  devsys_models: "codemode",
  devsys_task_check: "codemode",
  devsys_route_task: "codemode",
  judge_sizing: "codemode",
  judge_test_change: "codemode",
  judge_lenses: "codemode",
  judge_task_readiness: "codemode",
};

const exposures = (fake: ReturnType<typeof createFakePi>) =>
  Object.fromEntries(
    [...fake.tools.values()]
      .filter((t) => t.name in EXPOSURE)
      .map((t) => [t.name, t.exposure ?? "direct"]),
  );

test("each devsys tool has the exposure its role calls for", () => {
  const fake = createFakePi();
  createDevelopmentSystem(fake.api);
  assert.deepEqual(exposures(fake), EXPOSURE);
});

test("with codemode off, session start declares the codemode tools directly", async () => {
  const fake = createFakePi();
  createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  const seen = exposures(fake);
  for (const [name, wanted] of Object.entries(EXPOSURE)) {
    const fallsBack = wanted === "codemode" && !name.startsWith("judge_");
    assert.equal(seen[name], fallsBack ? "direct" : wanted, name);
  }
});

test("the judge tools exist for scripts, so they stay behind codemode even when it is off", async () => {
  const fake = createFakePi();
  createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  for (const name of [
    "judge_sizing",
    "judge_test_change",
    "judge_lenses",
    "judge_task_readiness",
  ]) {
    assert.equal(fake.tools.get(name)?.exposure, "codemode", name);
  }
});

test("with codemode on, the codemode tools stay behind it", async () => {
  const fake = createFakePi({ activeTools: ["codemode"] });
  createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  assert.deepEqual(exposures(fake), EXPOSURE);
});

test("the Jev judgement tools share one namespace", () => {
  const fake = createFakePi();
  createDevelopmentSystem(fake.api);
  const names = [...fake.tools.values()]
    .filter((t) => t.name.startsWith("judge_"))
    .map((t) => t.namespace?.name);
  assert.deepEqual(names, ["devsys-judge", "devsys-judge", "devsys-judge", "devsys-judge"]);
});
