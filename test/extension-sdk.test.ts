import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDevelopmentSystem } from "../extensions/development-system.ts";
import { deferred } from "./harness/deferred.ts";
import { offlineSession } from "./harness/offline-session.ts";

test("custom extension messages trigger a real turn with development-system sections", {
  timeout: 10000,
}, async (t) => {
  let send: ExtensionAPI["sendMessage"] | undefined;
  const messageTypes: string[] = [];
  let requests = 0;
  const host = await offlineSession(
    t,
    (pi) => {
      createDevelopmentSystem(pi);
      send = pi.sendMessage;
      pi.on("before_agent_start", (event) => {
        messageTypes.push(event.messageType);
      });
    },
    (context) => {
      requests++;
      const sections = Object.assign(
        {},
        ...context.messages.filter((m) => m.role === "system").map((m) => m.sections),
      );
      assert.match(sections["development-system"] ?? "", /Never rewrite pushed history/);
      assert.match(sections["development-system-state"] ?? "", /phase: idle/);
      assert.ok(sections["pi-subagent"]);
      assert.ok(JSON.stringify(context.messages).includes("A detached agent completed."));
      return [];
    },
  );
  assert.ok(send);
  send({ customType: "status", content: "status only", display: false }, { triggerTurn: false });
  await host.session.waitForIdle();
  assert.equal(requests, 0, "a display-only notification must not invoke the model");
  const settled = deferred();
  const unsubscribe = host.session.subscribe((event) => {
    if (event.type === "agent_settled") settled.resolve();
  });
  t.after(unsubscribe);
  send(
    { customType: "subagent-summary", content: "A detached agent completed.", display: false },
    { triggerTurn: true },
  );
  await settled.promise;
  assert.equal(requests, 1);
  assert.deepEqual(messageTypes, ["custom"]);
  assert.equal(host.session.getLastAssistantText(), "done");
  assert.deepEqual(host.errors, []);
});

test("the offline SDK harness reports extension hook errors rather than hiding them", {
  timeout: 10000,
}, async (t) => {
  const host = await offlineSession(
    t,
    (pi) => {
      pi.on("before_agent_start", () => {
        throw new Error("deliberate-sdk-fixture-error");
      });
    },
    () => [],
  );
  await host.session.prompt("exercise diagnostics");
  assert.equal(host.session.getLastAssistantText(), "done");
  assert.equal(host.errors.length, 1);
  assert.match(JSON.stringify(host.errors[0]), /deliberate-sdk-fixture-error/);
});
