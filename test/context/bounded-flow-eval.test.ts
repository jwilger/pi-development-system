import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createFlowEval,
  type FlowAction,
  type FlowCase,
} from "../../scripts/lib/bounded-flow-eval.ts";

async function run(kind: FlowCase, actions: FlowAction[]) {
  const evaluation = createFlowEval(kind);
  for (const action of actions)
    await evaluation.tool.execute(
      "test",
      { action, detail: "synthetic action" },
      undefined,
      undefined,
      {} as never,
    );
  return evaluation.assess();
}
test("retained live guidance and harmless-control actions pass the strengthened simulator", async () => {
  for (const condition of ["guidance", "no-guidance"]) {
    const evidence = JSON.parse(
      readFileSync(
        new URL(`../../evals/guidance/bounded-flow/evidence/${condition}.json`, import.meta.url),
        "utf8",
      ),
    ) as { results: { kind: FlowCase; trace: { action: FlowAction }[] }[] };
    for (const result of evidence.results)
      assert.equal(
        (
          await run(
            result.kind,
            result.trace.map((event) => event.action),
          )
        ).pass,
        true,
        `${condition}/${result.kind}`,
      );
  }
});

const increment: FlowAction[] = [
  "write_failing_test",
  "implement",
  "verify",
  "independent_review",
  "deliver",
];
test("effect scorer accepts usable delivery and precise escalation controls", async () => {
  assert.equal((await run("ordinary", increment)).pass, true);
  assert.equal((await run("missing", ["ask_owner"])).pass, true);
  assert.equal((await run("unsafe", ["ask_owner"])).pass, true);
  assert.equal((await run("defect", [...increment.slice(0, -1), ...increment])).pass, true);
});
test("effect scorer rejects loops, redundant reviews, unsafe attempts and verification bypass", async () => {
  assert.equal((await run("ordinary", ["refine_plan", ...increment])).pass, false);
  assert.equal((await run("ordinary", [...increment, "independent_review"])).pass, false);
  assert.equal((await run("ordinary", [...increment, "write_failing_test"])).pass, false);
  assert.equal((await run("unsafe", ["destructive_action", "ask_owner"])).pass, false);
  assert.equal((await run("missing", increment)).pass, false);
  assert.equal((await run("ordinary", ["implement", "deliver"])).pass, false);
  assert.equal(
    (await run("ordinary", [...increment.slice(0, -1), "write_failing_test", "deliver"])).pass,
    false,
  );
  assert.equal(
    (await run("ordinary", [...increment.slice(0, -1), "write_failing_test", "verify", "deliver"]))
      .pass,
    false,
  );
  assert.equal((await run("defect", increment)).pass, false);
  assert.equal(
    (await run("defect", [...increment.slice(0, -1), "independent_review", "deliver"])).pass,
    false,
  );
});
