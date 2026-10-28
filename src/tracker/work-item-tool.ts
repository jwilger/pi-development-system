import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { Exec } from "../core/exec.ts";
import { assertNever } from "../core/exhaustive.ts";
import { CONFIG_FILE, configErrorText, loadConfig, POLICY_ONLY } from "../state/config.ts";
import { createTracker } from "./select.ts";
import { BASIC_TRACKER_ACTIONS, type Tracker, type TrackerResult, type WorkItem } from "./types.ts";

const Parameters = Type.Object({
  action: Type.Union(
    [
      Type.Literal("inspect"),
      Type.Literal("project-items"),
      Type.Literal("project-member"),
      Type.Literal("project-enroll"),
      Type.Literal("list"),
      Type.Literal("get"),
      Type.Literal("create"),
      Type.Literal("update"),
      Type.Literal("comment"),
    ],
    { description: "What to do with the work tracker." },
  ),
  id: Type.Optional(
    Type.String({
      description:
        "Work item id (get, update, comment); issue number (project-member, project-enroll).",
    }),
  ),
  fieldId: Type.Optional(
    Type.String({
      description:
        "Optional Project field node id to validate during inspection; never inferred from its name.",
    }),
  ),
  optionId: Type.Optional(
    Type.String({
      description: "Explicit single-select option id; project-items requires fieldId with it.",
    }),
  ),
  lifecycle: Type.Optional(
    Type.Union([Type.Literal("open"), Type.Literal("closed")], {
      description:
        "Explicit issue lifecycle filter for project-items; not a Project workflow state.",
    }),
  ),
  title: Type.Optional(Type.String({ description: "Title (create; optional rename on update)." })),
  body: Type.Optional(
    Type.String({ description: "Description (create, update) or comment text (comment)." }),
  ),
  status: Type.Optional(
    Type.Union([Type.Literal("open"), Type.Literal("in-progress"), Type.Literal("done")], {
      description:
        "Status (update), or a filter (list). On GitHub, listing done shows the newest 1000 closed issues.",
    }),
  ),
  labels: Type.Optional(Type.Array(Type.String(), { description: "Labels (create, update)." })),
});

type Params = Static<typeof Parameters>;

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

const line = (i: WorkItem): string => `${i.id} — ${i.title} (${i.status})`;

const detail = (i: WorkItem): string =>
  [
    line(i),
    i.labels.length > 0 ? `labels: ${i.labels.join(", ")}` : "",
    "",
    i.body,
    ...i.comments.map((c) => `\ncomment: ${c}`),
  ]
    .join("\n")
    .trim();

const missing = (action: string, field: string) => reply(`${action} needs ${field}`, true);

const show = <T>(result: TrackerResult<T>, render: (value: T) => string) =>
  result.ok ? reply(render(result.value)) : reply(result.error.message, true);

const optional = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });

const patchOf = (p: Params) => ({
  ...optional("status", p.status),
  ...optional("title", p.title),
  ...optional("body", p.body),
  ...optional("labels", p.labels),
});

async function create(tracker: Tracker, p: Params) {
  if (p.title === undefined) return missing("create", "title");
  const made = await tracker.create({
    title: p.title,
    ...optional("body", p.body),
    ...optional("labels", p.labels),
  });
  return show(made, (i) => `created ${line(i)}`);
}

async function update(tracker: Tracker, p: Params) {
  if (p.id === undefined) return missing("update", "id");
  const patch = patchOf(p);
  if (Object.keys(patch).length === 0) return missing("update", "status, title, body or labels");
  return show(await tracker.update(p.id, patch), (i) => `updated ${line(i)}`);
}

async function comment(tracker: Tracker, p: Params) {
  const { id, body } = p;
  if (id === undefined) return missing("comment", "id");
  if (body === undefined) return missing("comment", "body");
  return show(await tracker.comment(id, body), () => `commented on ${id}`);
}

async function run(tracker: Tracker, p: Params) {
  switch (p.action) {
    case "inspect":
      if (tracker.inspect !== undefined)
        return show(await tracker.inspect(p.fieldId), (inspection) => JSON.stringify(inspection));
      return p.fieldId === undefined
        ? reply(
            JSON.stringify({
              kind: tracker.kind,
              capabilities: BASIC_TRACKER_ACTIONS,
              project: null,
            }),
          )
        : reply("fieldId requires a configured GitHub Project", true);
    case "project-items":
      if (p.status !== undefined)
        return reply(
          "status is a legacy Issues projection; use lifecycle and explicit fieldId/optionId for Project observations",
          true,
        );
      return tracker.projectItems === undefined
        ? reply("project-items requires a configured GitHub Project and tracker.repo", true)
        : show(
            await tracker.projectItems({
              ...optional("lifecycle", p.lifecycle),
              ...optional("fieldId", p.fieldId),
              ...optional("optionId", p.optionId),
            }),
            (items) => JSON.stringify(items),
          );
    case "project-member":
      if (p.id === undefined) return missing(p.action, "id");
      if (tracker.projectMember === undefined)
        return reply("project-member requires a configured GitHub Project and tracker.repo", true);
      {
        const result = await tracker.projectMember(p.id);
        return result.ok
          ? reply(JSON.stringify(result.value), result.value.membership.kind === "unknown")
          : reply(result.error.message, true);
      }
    case "project-enroll":
      if (p.id === undefined) return missing(p.action, "id");
      if (tracker.projectEnroll === undefined)
        return reply("project-enroll requires a configured GitHub Project and tracker.repo", true);
      {
        const result = await tracker.projectEnroll(p.id);
        return result.ok
          ? reply(
              JSON.stringify(result.value),
              result.value.outcome === "blocked" || result.value.outcome === "unknown",
            )
          : reply(result.error.message, true);
      }
    case "list": {
      const items = await tracker.list(optional("status", p.status));
      return show(items, (all) => (all.length === 0 ? "no work items" : all.map(line).join("\n")));
    }
    case "get":
      return p.id === undefined ? missing("get", "id") : show(await tracker.get(p.id), detail);
    case "create":
      return create(tracker, p);
    case "update":
      return update(tracker, p);
    case "comment":
      return comment(tracker, p);
    default:
      return assertNever(p.action);
  }
}

/** `devsys_work_item`: the one way planning reads and writes work items, whatever `[tracker] kind` says. */
export function createWorkItemTool(deps: { exec: Exec }): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_work_item",
    label: "Work items",
    description:
      "List, read, create, update or comment on work items in the project's tracker (repo files by default, GitHub issues when configured). " +
      "Use it for the backlog instead of editing tracker files or running gh by hand.",
    promptSnippet: "Read and write the project's work items",
    parameters: Parameters,
    exposure: "codemode",
    async execute(
      _id,
      params: Static<typeof Parameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const config = await loadConfig(ctx.cwd, POLICY_ONLY);
      if (!config.ok) return reply(configErrorText(config.error), true);
      const tracker = createTracker({
        tracker: config.value.tracker,
        exec: deps.exec,
        cwd: ctx.cwd,
      });
      if (!tracker.ok) return reply(`${CONFIG_FILE}: ${tracker.error.message}`, true);
      return run(tracker.value, params);
    },
  };
}
