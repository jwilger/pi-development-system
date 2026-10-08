import assert from "node:assert/strict";
import test from "node:test";
import { packetFromSubmission, type Submission } from "../../src/core/review-submission.ts";

const base: Submission = {
  slice: "s1",
  round: 1,
  lenses: ["types", "tests"],
  sources: ["a.ts:1-5"],
  findings: [],
  verdict: "no-blocking",
};

test("a submission with no findings becomes a clean packet", () => {
  const packet = packetFromSubmission(base);
  assert.ok("verdict" in packet);
  assert.deepEqual(packet, { ...base, findings: [] });
});

test("findings get stable ids and a location split into path and line", () => {
  const packet = packetFromSubmission({
    ...base,
    verdict: "blocking",
    findings: [
      { lens: "types", severity: "should-fix", path: "a.ts", line: 7, summary: "no test" },
      { lens: "tests", severity: "nit", summary: "naming" },
    ],
  });
  assert.ok("findings" in packet);
  assert.deepEqual(packet.findings, [
    {
      id: "types-1",
      severity: "should-fix",
      path: "a.ts",
      line: 7,
      summary: "no test",
      lens: "types",
    },
    { id: "tests-2", severity: "nit", summary: "naming", lens: "tests" },
  ]);
});

test("a verdict that contradicts the findings is refused with a stable id", () => {
  const blockingFinding = [{ lens: "types", severity: "blocking" as const, summary: "broken" }];
  const clean = packetFromSubmission({
    ...base,
    verdict: "no-blocking",
    findings: blockingFinding,
  });
  assert.deepEqual(clean, {
    id: "verdict-contradicts-findings",
    message:
      'verdict "no-blocking" contradicts the findings: blocking/should-fix findings mean "blocking", otherwise "no-blocking"',
  });
  const nitOnly = packetFromSubmission({
    ...base,
    verdict: "blocking",
    findings: [{ lens: "types", severity: "nit" as const, summary: "style" }],
  });
  assert.ok("id" in nitOnly && nitOnly.id === "verdict-contradicts-findings");
});

test("a finding for a lens the packet does not list is refused", () => {
  const r = packetFromSubmission({
    ...base,
    findings: [{ lens: "security", severity: "nit", summary: "x" }],
  });
  assert.ok("id" in r);
  assert.equal(r.id, "finding-lens-not-listed");
  assert.match(r.message, /security/);
});
