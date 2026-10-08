import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSlice, type Slice, validateModel } from "../../src/planning/slice-schema.ts";

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/event-model/${name}`, import.meta.url), "utf8");

const slice = (name: string): Slice => {
  const parsed = parseSlice(fixture(name), "yaml");
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};

const model = (): Slice[] => [slice("register.yaml"), slice("signin.yaml"), slice("sessions.yaml")];
const codes = (slices: readonly Slice[]) => validateModel(slices).map((i) => i.code);

test("a slice parses from YAML and from JSON", () => {
  const fromYaml = parseSlice(fixture("signin.yaml"), "yaml");
  assert.ok(fromYaml.ok);
  assert.equal(fromYaml.ok && fromYaml.value.command?.name, "SignIn");
  const fromJson = parseSlice(JSON.stringify(slice("signin.yaml")), "json");
  assert.deepEqual(fromJson.ok && fromJson.value, fromYaml.ok && fromYaml.value);
});

test("a slice that breaks the schema is an error naming where", () => {
  const bad = parseSlice(fixture("signin.yaml").replace("state-change", "state-chnage"), "yaml");
  assert.ok(!bad.ok);
  assert.match(bad.ok ? "" : bad.error.message, /pattern/);
  const extra = parseSlice(`${fixture("signin.yaml")}surprise: 1\n`, "yaml");
  assert.ok(!extra.ok);
  assert.ok(!parseSlice("{ not json", "json").ok);
  assert.ok(!parseSlice("- just\n- a list\n", "yaml").ok);
});

test("the sample model is complete", () => {
  assert.deepEqual(validateModel(model()), []);
});

test("a view field that no source event carries is missing-origin", () => {
  const slices = model();
  const view = slices[2];
  assert.ok(view?.views?.[0]);
  view.views[0].fields.displayName = "string";
  const issues = validateModel(slices);
  assert.deepEqual(
    issues.map((i) => [i.code, i.slice]),
    [["missing-origin", "slice.sessions.v01"]],
  );
  assert.match(issues[0]?.message ?? "", /displayName/);
});

test("a system command field needs a view or event to come from; a user's is typed in", () => {
  const slices = model();
  const auto: Slice = {
    id: "slice.expire.a01",
    pattern: "automation",
    actor: "system",
    command: { name: "ExpireSession", fields: { sessionToken: "id" } },
    events: [{ name: "SessionExpired", fields: { userId: "id" } }],
    views: [],
    gwt: [
      {
        given: [{ event: "SignedIn" }],
        when: { command: "ExpireSession" },
        // biome-ignore lint/suspicious/noThenProperty: "then" is the Given/When/Then key the slice schema (plan Appendix D) defines; these objects are never awaited.
        then: [{ event: "SessionExpired" }],
      },
    ],
  };
  assert.deepEqual(codes([...slices, auto]), ["missing-origin", "orphan-event"]);
  const fed = { ...auto, command: { name: "ExpireSession", fields: { userId: "id" } } };
  assert.deepEqual(codes([...slices, fed]), ["orphan-event"]);
});

test("ids, command, event and view names are each unique in the model", () => {
  const slices = model();
  assert.deepEqual(codes([...slices, slices[0] as Slice]), [
    "duplicate-id",
    "duplicate-id",
    "duplicate-id",
  ]);
});

test("a reference to an event, command or view the model does not declare is unknown-ref", () => {
  const slices = model();
  const signin = slices[1];
  assert.ok(signin?.gwt?.[0]);
  signin.gwt[0].given = [{ event: "NobodyDeclaredThis" }];
  assert.deepEqual(codes(slices), ["unknown-ref"]);
  const renamed = model();
  const view = renamed[2];
  assert.ok(view?.views?.[0]);
  view.views[0].sources = ["SignedOut"];
  assert.ok(codes(renamed).includes("unknown-ref"));
  const wrongWhen = model();
  const reg = wrongWhen[0];
  assert.ok(reg?.gwt?.[0]?.when);
  reg.gwt[0].when.command = "SignIn";
  assert.ok(codes(wrongWhen).includes("unknown-ref"));
  const typoEvent = model();
  const typoScenario = typoEvent[1]?.gwt?.[0];
  assert.ok(typoScenario);
  // biome-ignore lint/suspicious/noThenProperty: "then" is the Given/When/Then key the slice schema (plan Appendix D) defines; these objects are never awaited.
  typoScenario.then = [{ event: "SignedInn" }];
  assert.deepEqual(codes(typoEvent), ["unknown-ref"]);
  const typoView = model();
  const viewScenario = typoView[1]?.gwt?.[0];
  assert.ok(viewScenario);
  // biome-ignore lint/suspicious/noThenProperty: "then" is the Given/When/Then key the slice schema (plan Appendix D) defines; these objects are never awaited.
  viewScenario.then = [{ view: "NoSuchView" }];
  assert.deepEqual(codes(typoView), ["unknown-ref"]);
});

test("a syntax error in a slice file is reported on one line", () => {
  const parsed = parseSlice("id: a: b\n", "yaml");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok ? "" : parsed.error.message.includes("\n"), false);
});

test("a scenario without a when, or with an empty then, is flagged", () => {
  const slices = model();
  const reg = slices[0];
  assert.ok(reg?.gwt?.[0]);
  const { when: _dropped, ...noWhen } = reg.gwt[0];
  reg.gwt[0] = noWhen;
  // biome-ignore lint/suspicious/noThenProperty: "then" is the Given/When/Then key the slice schema (plan Appendix D) defines; these objects are never awaited.
  reg.gwt[1] = { ...(reg.gwt[1] as NonNullable<Slice["gwt"]>[number]), then: [] };
  assert.deepEqual(codes(slices), ["gwt-without-when", "gwt-then-empty"]);
});

test("a state-change with a command and no events has nowhere to go", () => {
  const slices = model();
  const reg = slices[0];
  assert.ok(reg);
  reg.events = [];
  reg.gwt = [];
  assert.ok(codes(slices).includes("missing-destination"));
});

test("a slice whose parts do not fit its pattern is pattern-field-mismatch", () => {
  const view = slice("sessions.yaml");
  const withCommand: Slice = { ...view, command: { name: "Oops", fields: {} } };
  assert.ok(
    codes([slice("register.yaml"), slice("signin.yaml"), withCommand]).includes(
      "pattern-field-mismatch",
    ),
  );
  const { command: _dropped, ...rest } = slice("signin.yaml");
  const noCommand: Slice = rest;
  assert.ok(codes([noCommand]).includes("pattern-field-mismatch"));
  const userAutomation: Slice = { ...slice("signin.yaml"), pattern: "automation" };
  assert.ok(codes([userAutomation]).includes("pattern-field-mismatch"));
  const viewWithWhen: Slice = {
    ...view,
    // biome-ignore lint/suspicious/noThenProperty: "then" is the Given/When/Then key the slice schema (plan Appendix D) defines; these objects are never awaited.
    gwt: [{ given: [], when: { command: "NoSuchCommand" }, then: [{ view: "ActiveSessions" }] }],
  };
  assert.ok(
    codes([slice("register.yaml"), slice("signin.yaml"), viewWithWhen]).includes(
      "pattern-field-mismatch",
    ),
  );
});

test("an event nothing reads is only a warning; the rest are errors", () => {
  const slices = model();
  const reg = slices[0];
  assert.ok(reg);
  reg.events = [...reg.events, { name: "AuditNoted", fields: { at: "timestamp" } }];
  const issues = validateModel(slices);
  assert.deepEqual(
    issues.map((i) => [i.code, i.severity]),
    [["orphan-event", "warning"]],
  );
});

test("a command run by any human actor takes its fields from the person, not from the model", () => {
  const signIn = slice("signin.yaml");
  for (const actor of ["customer", "admin"]) {
    assert.deepEqual(
      codes([slice("register.yaml"), { ...signIn, actor }, slice("sessions.yaml")]),
      [],
    );
  }
});
