import { type Static, Type } from "typebox";
import Value from "typebox/value";
import { parse as parseYaml } from "yaml";
import { err, ok, type Result } from "../core/result.ts";
import { type ParseError, parseError } from "../core/types.ts";

/**
 * Event-model lite, slice schema v1 (plan Appendix D). One slice is one command-to-events step, one
 * view over events, or one automation; Given/When/Then scenarios say what it must do. The schema is
 * deliberately small: a validator that needs more than this to pass is asking for invented policy.
 */

const Fields = Type.Record(Type.String(), Type.String());
const Values = Type.Record(Type.String(), Type.Unknown());
const Name = Type.String({ minLength: 1 });

const SlicePattern = Type.Union([
  Type.Literal("state-change"),
  Type.Literal("state-view"),
  Type.Literal("automation"),
]);

const EventDecl = Type.Object({ name: Name, fields: Fields }, { additionalProperties: false });
const ViewDecl = Type.Object(
  { name: Name, fields: Fields, sources: Type.Array(Name) },
  { additionalProperties: false },
);
const Given = Type.Object(
  { event: Name, let: Type.Optional(Values) },
  { additionalProperties: false },
);
const When = Type.Object(
  { command: Name, let: Type.Optional(Values) },
  { additionalProperties: false },
);
const Then = Type.Union([
  Type.Object({ event: Name, let: Type.Optional(Values) }, { additionalProperties: false }),
  Type.Object({ error: Name }, { additionalProperties: false }),
  Type.Object({ view: Name, let: Type.Optional(Values) }, { additionalProperties: false }),
]);
const Scenario = Type.Object(
  // biome-ignore lint/suspicious/noThenProperty: "then" is the Given/When/Then key the slice schema (plan Appendix D) defines; these objects are never awaited.
  { given: Type.Array(Given), when: Type.Optional(When), then: Type.Array(Then) },
  { additionalProperties: false },
);

const SliceSchema = Type.Object(
  {
    id: Name,
    pattern: SlicePattern,
    actor: Name,
    command: Type.Optional(
      Type.Object({ name: Name, fields: Fields }, { additionalProperties: false }),
    ),
    events: Type.Optional(Type.Array(EventDecl)),
    views: Type.Optional(Type.Array(ViewDecl)),
    gwt: Type.Optional(Type.Array(Scenario)),
  },
  { additionalProperties: false },
);

type Raw = Static<typeof SliceSchema>;

/** A parsed slice: the optional lists are present, empty when the file left them out. */
export type Slice = Omit<Raw, "events" | "views" | "gwt"> & {
  events: Static<typeof EventDecl>[];
  views: Static<typeof ViewDecl>[];
  gwt: Static<typeof Scenario>[];
};

export type SliceFormat = "json" | "yaml";

/** One slice from JSON or YAML text; a schema violation names the path and the rule it broke. */
export function parseSlice(text: string, format: SliceFormat): Result<Slice, ParseError> {
  let data: unknown;
  try {
    data = format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    // The yaml library appends a code frame; the first line is the reason, and a report is one line per issue.
    return err(parseError(`not valid ${format}: ${reason.split("\n")[0]}`));
  }
  const first = Value.Errors(SliceSchema, data)[0];
  if (first !== undefined) {
    return err(
      parseError(`${first.instancePath === "" ? "/" : first.instancePath}: ${first.message}`),
    );
  }
  const raw = data as Raw;
  return ok({ ...raw, events: raw.events ?? [], views: raw.views ?? [], gwt: raw.gwt ?? [] });
}

type ValidationCode =
  | "duplicate-id"
  | "unknown-ref"
  | "missing-origin"
  | "missing-destination"
  | "gwt-without-when"
  | "gwt-then-empty"
  | "orphan-event"
  | "pattern-field-mismatch";

export type ValidationIssue = {
  code: ValidationCode;
  /** An orphan event may be a deliberate end of the line; everything else is a hole in the model. */
  severity: "error" | "warning";
  slice: string;
  message: string;
};

const issue = (
  code: ValidationCode,
  slice: string,
  message: string,
  severity: ValidationIssue["severity"] = "error",
): ValidationIssue => ({ code, severity, slice, message });

function duplicates(slices: readonly Slice[]): ValidationIssue[] {
  const seen = {
    id: new Set<string>(),
    command: new Set<string>(),
    event: new Set<string>(),
    view: new Set<string>(),
  };
  const out: ValidationIssue[] = [];
  const claim = (kind: keyof typeof seen, name: string, slice: string): void => {
    if (seen[kind].has(name)) {
      out.push(issue("duplicate-id", slice, `the ${kind} "${name}" is declared more than once`));
    }
    seen[kind].add(name);
  };
  for (const s of slices) {
    claim("id", s.id, s.id);
    if (s.command) claim("command", s.command.name, s.id);
    for (const e of s.events) claim("event", e.name, s.id);
    for (const v of s.views) claim("view", v.name, s.id);
  }
  return out;
}

type Model = {
  events: Map<string, Record<string, string>>;
  views: Map<string, Record<string, string>>;
  usedEvents: Set<string>;
};

const indexModel = (slices: readonly Slice[]): Model => {
  const events = new Map<string, Record<string, string>>();
  const views = new Map<string, Record<string, string>>();
  const usedEvents = new Set<string>();
  for (const s of slices) {
    for (const e of s.events) events.set(e.name, e.fields);
    for (const v of s.views) {
      views.set(v.name, v.fields);
      for (const source of v.sources) usedEvents.add(source);
    }
    for (const g of s.gwt) for (const given of g.given) usedEvents.add(given.event);
  }
  return { events, views, usedEvents };
};

function shape(s: Slice): ValidationIssue[] {
  const problems: string[] = [];
  if (s.pattern === "state-view") {
    if (s.views.length === 0) problems.push("a state-view needs at least one view");
    if (s.command) problems.push("a state-view has no command");
    if (s.events.length > 0) problems.push("a state-view declares no events; its sources do");
  } else {
    if (!s.command) problems.push(`a ${s.pattern} needs a command`);
    if (s.views.length > 0) problems.push(`a ${s.pattern} declares no views`);
    if (s.pattern === "automation" && s.actor !== "system") {
      problems.push('an automation is run by the actor "system"');
    }
  }
  return problems.map((p) => issue("pattern-field-mismatch", s.id, p));
}

function commandOrigins(s: Slice, model: Model): ValidationIssue[] {
  if (!s.command || s.actor !== "system") return [];
  const known = new Set<string>();
  for (const fields of model.views.values()) for (const f of Object.keys(fields)) known.add(f);
  for (const g of s.gwt) {
    for (const given of g.given) {
      for (const f of Object.keys(model.events.get(given.event) ?? {})) known.add(f);
    }
  }
  return Object.keys(s.command.fields)
    .filter((f) => !known.has(f))
    .map((f) =>
      issue("missing-origin", s.id, `command field "${f}" comes from no view or triggering event`),
    );
}

function viewIssues(s: Slice, model: Model): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const view of s.views) {
    const carried = new Set<string>();
    for (const source of view.sources) {
      const fields = model.events.get(source);
      if (fields === undefined) {
        out.push(
          issue(
            "unknown-ref",
            s.id,
            `view "${view.name}" reads event "${source}", which no slice declares`,
          ),
        );
      } else {
        for (const f of Object.keys(fields)) carried.add(f);
      }
    }
    for (const f of Object.keys(view.fields)) {
      if (!carried.has(f)) {
        out.push(
          issue(
            "missing-origin",
            s.id,
            `view field "${f}" of "${view.name}" is carried by none of its source events`,
          ),
        );
      }
    }
  }
  return out;
}

function whenIssues(s: Slice, g: Slice["gwt"][number], where: string): ValidationIssue[] {
  if (s.pattern === "state-view") {
    return g.when === undefined
      ? []
      : [issue("pattern-field-mismatch", s.id, `${where} of a state-view has no when`)];
  }
  if (g.when === undefined) return [issue("gwt-without-when", s.id, `${where} has no when`)];
  if (g.when.command === s.command?.name) return [];
  const own = s.command?.name ?? "command";
  return [
    issue(
      "unknown-ref",
      s.id,
      `${where} runs command "${g.when.command}", not this slice's ${own}`,
    ),
  ];
}

function thenIssues(
  s: Slice,
  g: Slice["gwt"][number],
  where: string,
  model: Model,
): ValidationIssue[] {
  if (g.then.length === 0) return [issue("gwt-then-empty", s.id, `${where} expects nothing`)];
  return g.then.flatMap((t) => {
    if ("event" in t && !model.events.has(t.event)) {
      return [
        issue("unknown-ref", s.id, `${where} expects event "${t.event}", which no slice declares`),
      ];
    }
    if ("view" in t && !model.views.has(t.view)) {
      return [
        issue("unknown-ref", s.id, `${where} expects view "${t.view}", which no slice declares`),
      ];
    }
    return [];
  });
}

function scenarioIssues(s: Slice, model: Model): ValidationIssue[] {
  return s.gwt.flatMap((g, i) => {
    const where = `scenario ${i + 1}`;
    const given = g.given
      .filter((x) => !model.events.has(x.event))
      .map((x) =>
        issue("unknown-ref", s.id, `${where} gives event "${x.event}", which no slice declares`),
      );
    return [...whenIssues(s, g, where), ...given, ...thenIssues(s, g, where, model)];
  });
}

function ownIssues(s: Slice, model: Model): ValidationIssue[] {
  const missingDestination =
    s.pattern !== "state-view" && s.command && s.events.length === 0
      ? [issue("missing-destination", s.id, `command "${s.command.name}" produces no events`)]
      : [];
  const orphans = s.events
    .filter((e) => !model.usedEvents.has(e.name))
    .map((e) =>
      issue(
        "orphan-event",
        s.id,
        `event "${e.name}" feeds no view and starts no scenario`,
        "warning",
      ),
    );
  return [
    ...shape(s),
    ...missingDestination,
    ...commandOrigins(s, model),
    ...viewIssues(s, model),
    ...scenarioIssues(s, model),
    ...orphans,
  ];
}

/**
 * Checks a whole model: names are unique, every reference resolves, and information is complete (every
 * view field has an event origin, every system command field a source). Judges nothing the model does
 * not say: a hole is reported, never filled.
 */
export function validateModel(slices: readonly Slice[]): ValidationIssue[] {
  const model = indexModel(slices);
  return [...duplicates(slices), ...slices.flatMap((s) => ownIssues(s, model))];
}
