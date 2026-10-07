import assert from "node:assert/strict";
import test from "node:test";
import { TIMEOUT_CODE, timeoutAsFailure } from "../../src/core/exec.ts";

test("a killed command is a failure even though pi reports code 0", () => {
  const r = timeoutAsFailure({ code: 0, stdout: "", stderr: "", killed: true });
  assert.equal(r.code, TIMEOUT_CODE);
  assert.match(r.stderr, /timed out/);
});

test("a command that finished keeps its result", () => {
  assert.deepEqual(timeoutAsFailure({ code: 3, stdout: "o", stderr: "e", killed: false }), {
    code: 3,
    stdout: "o",
    stderr: "e",
  });
});
