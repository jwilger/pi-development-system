import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets } from "../../src/core/redact.ts";

test("redacts URL userinfo credentials", () => {
  assert.equal(
    redactSecrets("git push https://user:ghp_abc123@github.com/o/r --force"),
    "git push https://[redacted]@github.com/o/r --force",
  );
});

test("redacts token-only userinfo", () => {
  assert.equal(
    redactSecrets("git push https://ghp_abc123@host/r -f"),
    "git push https://[redacted]@host/r -f",
  );
});

test("redacts well-known token shapes outside URLs", () => {
  assert.equal(redactSecrets("echo ghp_0123456789abcdefghij0123456789ab"), "echo [redacted]");
  assert.equal(
    redactSecrets("TOKEN=sk-abcdefghijklmnopqrstuv git push -f"),
    "TOKEN=[redacted] git push -f",
  );
});

test("leaves ordinary commands untouched", () => {
  assert.equal(redactSecrets("git push --force origin main"), "git push --force origin main");
});

test("redacts secret-looking env assignments and bearer tokens", () => {
  assert.equal(
    redactSecrets("GH_TOKEN=abcd1234efgh git push -f"),
    "GH_TOKEN=[redacted] git push -f",
  );
  assert.equal(redactSecrets("TYPESAFE_API_KEY=ts_abcdef x"), "TYPESAFE_API_KEY=[redacted] x");
  assert.equal(
    redactSecrets("curl -H 'Authorization: Bearer abc.def'"),
    "curl -H 'Authorization: Bearer [redacted]'",
  );
});
