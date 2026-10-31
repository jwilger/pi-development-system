import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseAssessment } from "../../src/jev/reasoning.ts";

test("unresolved evidence diagnostics redact credentials, remove controls and bound the reason", () => {
  const credential = randomUUID();
  const reason = `Need contract API_KEY=${credential} \u001b[31mred\u0007\u0085 ${"x".repeat(900)} END-OF-UNTRUSTED-REASON`;
  const result = parseAssessment(JSON.stringify({ status: "unresolved", reason }), questions);
  assert.equal(result.ok, false);
  if (!result.ok && result.error.kind === "assessment-unresolved") {
    const message = result.error.message;
    assert.match(message, /^reasoning.evidence: Need contract API_KEY=\[redacted\]/);
    assert.ok(!message.includes(credential));
    assert.ok(
      [...message].every(
        (c) => c.charCodeAt(0) >= 32 && (c.charCodeAt(0) < 127 || c.charCodeAt(0) > 159),
      ),
    );
    const suffix = "; supply the missing evidence or narrow the operation, not human permission.";
    assert.ok(message.endsWith(suffix));
    const displayedReason = message.slice("reasoning.evidence: ".length, -suffix.length);
    assert.equal(displayedReason.length, 500);
    assert.ok(!message.includes("END-OF-UNTRUSTED-REASON"));
  } else assert.fail("expected unresolved assessment diagnostic");
});

const questions = {
  weakens: {
    type: "bool" as const,
    instructions: "Coverage lost?",
    criteria: { true: "yes", false: "no" },
  },
};
for (const [name, response, diagnostic] of [
  ["invalid JSON", "not json", /reasoning\.json/],
  ["malformed schema", '{"status":"resolved","answers":{}}', /reasoning\.schema/],
  [
    "missing evidence",
    '{"status":"unresolved","reason":"Need the owner contract"}',
    /reasoning\.evidence.*Need the owner contract/,
  ],
  [
    "missing answer",
    '{"status":"resolved","reason":"ok","answers":{}}',
    /reasoning\.answers.*weakens.*missing/,
  ],
  [
    "uncertain answer",
    '{"status":"resolved","reason":"ok","answers":{"weakens":{"type":"bool","probability":0.5}}}',
    /reasoning\.answers.*weakens.*uncertain/,
  ],
] as const) {
  test(`assessment diagnostic distinguishes ${name}`, () => {
    const result = parseAssessment(response, questions);
    assert.equal(result.ok, false);
    if (!result.ok && result.error.kind === "assessment-unresolved")
      assert.match(result.error.message, diagnostic);
    else assert.fail("expected unresolved assessment diagnostic");
  });
}
