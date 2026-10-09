import assert from "node:assert/strict";
import test from "node:test";
import { credentialKinds, filesOfDiff, findSecrets } from "../../src/core/secrets.ts";

const diffOf = (path: string, ...added: string[]) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1 @@\n${added.map((l) => `+${l}`).join("\n")}\n`;
const scan = (path: string, ...added: string[]) => findSecrets(filesOfDiff(diffOf(path, ...added)));

// Built in pieces so this file never carries a credential-shaped literal itself.
const GH = `ghp_${"a1B2".repeat(9)}`;
const AWS = `AKIA${"A1B2C3D4E5F6G7H8"}`;
const STRIPE = `sk_live_${"abcd1234".repeat(3)}`;
const PRIVATE_KEY = `-----BEGIN ${"RSA"} PRIVATE KEY-----`;

test("unmistakable credential formats are found, named by kind and never by value", () => {
  for (const [line, kind] of [
    [`const t = "${GH}";`, "a GitHub token"],
    [`aws = ${AWS}`, "an AWS access key id"],
    [`key: ${STRIPE}`, "a live Stripe key"],
    [PRIVATE_KEY, "a private key"],
    [`url = "postgres://admin:${"s3cr3tpass"}@db.example.com/app"`, "a password inside a URL"],
    [`const apiKey = "${"k3y".repeat(8)}";`, "a secret assigned a literal value"],
  ] as const) {
    const found = scan("src/config.ts", line);
    assert.deepEqual(found, [`src/config.ts contains ${kind}`], line);
    assert.doesNotMatch(found.join(), new RegExp(GH));
  }
});

test("ordinary code that mentions secrets is not flagged", () => {
  for (const line of [
    "const token: string = readToken();",
    'password: "changeme"',
    'const secret = process.env["SECRET"];',
    ["const url = `postgres://user:$", "{password}@host/db`;"].join(""),
    "postgres://user:<password>@host/db",
    "https://user:********@example.com",
    'const tokenName = "authorizationHeaderValueName";',
    "ghp_ is the prefix of a GitHub token",
  ]) {
    assert.deepEqual(scan("src/a.ts", line), [], line);
  }
});

test("only added lines count; a removed secret is not a finding", () => {
  const diff = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-const t = "${GH}";\n+const t = read();\n`;
  assert.deepEqual(findSecrets(filesOfDiff(diff)), []);
});

test("files that hold credentials are flagged by name, templates are not", () => {
  for (const path of [
    ".env",
    "app/.env.local",
    "keys/server.pem",
    "home/.ssh/id_ed25519",
    ".netrc",
  ]) {
    assert.deepEqual(scan(path, "x"), [`${path} is a file that holds credentials`], path);
  }
  for (const path of [".env.example", ".env.sample", "docs/env.md", "src/pemfile.ts"]) {
    assert.deepEqual(scan(path, "x"), [], path);
  }
});

test("each file is reported separately with each kind once", () => {
  const diff = `${diffOf("a.ts", `x = "${GH}"`, `y = "${GH}"`)}${diffOf("b.ts", "const ok = 1;")}`;
  assert.deepEqual(findSecrets(filesOfDiff(diff)), ["a.ts contains a GitHub token"]);
});

test("the kinds of credential in a piece of text are listed once each, without values", () => {
  const text = `deploy with ${GH}\nand again ${GH}\nkey ${AWS}`;
  assert.deepEqual(credentialKinds(text), ["a GitHub token", "an AWS access key id"]);
  assert.deepEqual(credentialKinds("Review src/a.ts and report findings."), []);
});

test("deleting a credential file is the fix, not a finding", () => {
  const diff =
    "diff --git a/.env b/.env\ndeleted file mode 100644\nindex 1..0\n--- a/.env\n+++ /dev/null\n@@ -1 +0,0 @@\n-KEY=value\n";
  assert.deepEqual(findSecrets(filesOfDiff(diff)), []);
});

test("a placeholder password in a connection URL is not a credential", () => {
  const url = (pw: string) => `DATABASE_URL=postgres://postgres:${pw}@localhost:5432/app_test`;
  assert.deepEqual(credentialKinds(url("postgres")), []);
  assert.deepEqual(credentialKinds(url("Zk3hQp9vR2xL")), ["a password inside a URL"]);
});

test("a path git would quote is still read", () => {
  const diff =
    'diff --git "a/caf\\303\\251/.env" "b/caf\\303\\251/.env"\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n+AWS=AKIAABCDEFGHIJKLMNOP\n';
  assert.equal(findSecrets(filesOfDiff(diff)).length, 2);
});

test("a digit in the variable name does not make a placeholder look random", () => {
  assert.deepEqual(credentialKinds('OAUTH2_CLIENT_SECRET="replace-with-your-client-secret"'), []);
});
