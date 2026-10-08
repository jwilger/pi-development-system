import assert from "node:assert/strict";
import test from "node:test";
import { lintBrief } from "../../src/planning/brief-lint.ts";

const kinds = (text: string) => lintBrief(text).map((f) => f.kind);

test("a brief about outcomes and people has no solution-level markers", () => {
  const brief =
    "# Brief\n\nOutcome: support agents resolve a ticket in 9 minutes instead of 14.\n\nUsers: support agents.\n";
  assert.deepEqual(lintBrief(brief), []);
});

test("an HTTP endpoint is flagged with its line number", () => {
  const found = lintBrief("# Brief\n\nThe app calls POST /api/v2/orders to place an order.\n");
  assert.deepEqual(
    found.map((f) => [f.kind, f.line]),
    [["endpoint", 3]],
  );
});

test("a SQL table or column definition is flagged", () => {
  assert.deepEqual(kinds("We add CREATE TABLE orders (id uuid) for storage."), ["table"]);
  assert.deepEqual(kinds("Add a column to the `orders` table."), ["table"]);
});

test("a class or interface declaration and a PascalCase service name are flagged", () => {
  assert.deepEqual(kinds("Introduce class OrderRepository to hold orders."), ["class"]);
  assert.deepEqual(kinds("The CheckoutService calls the PaymentGateway."), ["class", "class"]);
});

test("a source file path is flagged", () => {
  assert.deepEqual(kinds("Change src/orders/checkout.ts to retry."), ["path"]);
});

test("markers inside a fenced example are ignored", () => {
  assert.deepEqual(lintBrief("```\nPOST /api/orders\n```\nOutcome: faster checkout."), []);
});

test("product words that merely look technical are not flagged", () => {
  assert.deepEqual(
    lintBrief("Users open the Settings page and press Save. See docs/product/brief.md."),
    [],
  );
});

test("each finding explains where the detail belongs", () => {
  const [f] = lintBrief("POST /api/orders");
  assert.match(f?.message ?? "", /ADR|architecture/i);
});
