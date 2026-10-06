import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  type Departure,
  matchesPending,
  parseDeparture,
  renderDepartureMarkdown,
} from "../../src/core/departure.ts";
import { isParseError, parseGateId } from "../../src/core/types.ts";

const gate = (id: string) => {
  const parsed = parseGateId(id);
  if (isParseError(parsed)) throw new Error(parsed.message);
  return parsed;
};

const sample = (over: Record<string, unknown> = {}): unknown => ({
  id: "dep-1",
  gate: "tdd.red-first",
  tier: "soft",
  default: "write a failing test before changing src/core/x.ts",
  chosen: "edit first; the change is a pure rename with no behaviour change",
  why: "Tidy-First structural change; existing tests cover behaviour",
  costIfWrong: "a behavioural change slips through without a test",
  approver: "agent",
  scope: { kind: "slice", slice: "I4.3" },
  revisitWhen: "the rename touches a public signature",
  recordedAt: "2026-10-06T17:12:00Z",
  ...over,
});

const parsed = (input: unknown): Departure => {
  const d = parseDeparture(input);
  if (isParseError(d)) throw new Error(d.message);
  return d;
};

test("renderDepartureMarkdown matches the Appendix A fixture byte for byte", () => {
  const expected = readFileSync(new URL("../fixtures/departure.md", import.meta.url), "utf8");
  assert.equal(renderDepartureMarkdown(parsed(sample())), expected);
});

test("renderDepartureMarkdown renders once and session scopes and omits absent revisit", () => {
  const once = renderDepartureMarkdown(
    parsed(
      sample({
        tier: "hard",
        approver: "user",
        scope: { kind: "once", toolCallId: "call-9" },
        revisitWhen: undefined,
      }),
    ),
  );
  assert.match(once, /· hard · user\n/);
  assert.match(once, /- \*\*Scope:\*\* once \(call-9\)\n$/);
  const session = renderDepartureMarkdown(parsed(sample({ scope: { kind: "session" } })));
  assert.match(session, /- \*\*Scope:\*\* session · \*\*Revisit when:\*\*/);
});

test("parseDeparture rejects malformed input", () => {
  for (const bad of [
    null,
    [],
    sample({ gate: "Not A Gate" }),
    sample({ tier: "advisory" }),
    sample({ approver: "bot" }),
    sample({ scope: { kind: "slice" } }),
    sample({ scope: { kind: "forever" } }),
    sample({ why: 3 }),
    sample({ revisitWhen: 3 }),
  ]) {
    assert.equal(isParseError(parseDeparture(bad)), true, JSON.stringify(bad));
  }
});

test("matchesPending finds a recorded departure for the gate that is not in the future", () => {
  const d = parsed(sample());
  assert.equal(matchesPending([d], gate("tdd.red-first"), "2026-10-06T18:00:00Z"), d);
  assert.equal(matchesPending([d], gate("lints.suppression"), "2026-10-06T18:00:00Z"), undefined);
  assert.equal(matchesPending([d], gate("tdd.red-first"), "2026-10-06T10:00:00Z"), undefined);
});
