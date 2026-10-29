import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { assignIssue } from "./github-assignment.ts";
import { inspectProject } from "./github-project.ts";
import { observeProjectItems } from "./github-project-items.ts";
import { enrollProjectIssue, observeProjectMembership } from "./github-project-membership.ts";
import { setProjectField } from "./github-project-set.ts";
import { unwritable } from "./item-format.ts";
import { BASIC_TRACKER_ACTIONS } from "./types.ts";

/** Our status marker is a label; a user label with that name would change the status as a side effect. */
const unusable = (item: { title: string; labels: readonly string[] }): string | undefined =>
  item.labels.some(isMarker)
    ? '"in-progress" is reserved for the in-progress status; set status instead'
    : unwritable(item);

import {
  type ItemFilter,
  type NewWorkItem,
  type Tracker,
  type TrackerInspection,
  type TrackerResult,
  trackerError,
  type WorkItem,
  type WorkItemPatch,
  type WorkStatus,
} from "./types.ts";

const FIELDS = "number,title,body,state,labels,comments";
const IN_PROGRESS = "in-progress";
/** GitHub label names are case-insensitive, so `In-Progress` is our marker too. */
const isMarker = (name: string): boolean => name.toLowerCase() === IN_PROGRESS;
const ISSUE_NUMBER = /^[1-9][0-9]*$/;
const STATE_ARG = { open: "open", "in-progress": "open", done: "closed" } as const;

type GhIssue = {
  number: number;
  title: string;
  state: string;
  body?: string | null;
  labels?: { name: string }[];
  comments?: { body: string }[];
};

const isIssue = (value: unknown): value is GhIssue =>
  typeof value === "object" &&
  value !== null &&
  "number" in value &&
  typeof value.number === "number" &&
  "title" in value &&
  typeof value.title === "string" &&
  "state" in value &&
  typeof value.state === "string";

const statusOf = (state: string, labels: readonly string[]): WorkStatus => {
  if (state === "CLOSED") return "done";
  return labels.some(isMarker) ? "in-progress" : "open";
};

const toItem = (issue: GhIssue): WorkItem => {
  const names = (issue.labels ?? []).map((l) => l.name);
  return {
    id: String(issue.number),
    title: issue.title,
    body: issue.body ?? "",
    status: statusOf(issue.state, names),
    labels: names.filter((n) => !isMarker(n)),
    comments: (issue.comments ?? []).map((c) => c.body),
  };
};

const parseIssue = (text: string): GhIssue | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return isIssue(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const parseIssues = (text: string): GhIssue[] | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every(isIssue) ? value : undefined;
  } catch {
    return undefined;
  }
};

export type GithubTrackerDeps = {
  readonly exec: Exec;
  readonly cwd: string;
  /** `owner/name`; omitted means the repository of the working directory. */
  readonly repo?: string;
  readonly projectId?: string;
};

type Gh = (args: string[]) => Promise<TrackerResult<string>>;

const notNumber = (id: string) => trackerError(`"${id}" is not a GitHub issue number`);

const bindGh =
  (deps: GithubTrackerDeps): Gh =>
  async (args) => {
    const repoArgs = deps.repo === undefined ? [] : ["--repo", deps.repo];
    const result = await deps.exec("gh", [...args, ...repoArgs], {
      cwd: deps.cwd,
      timeout: 30_000,
    });
    if (result.code === 0) return ok(result.stdout);
    const why = result.stderr.trim() || `exit ${result.code}`;
    return trackerError(`gh ${args.slice(0, 2).join(" ")} failed: ${why}`);
  };

const viewRaw = async (gh: Gh, id: string): Promise<TrackerResult<GhIssue>> => {
  if (!ISSUE_NUMBER.test(id)) return notNumber(id);
  const out = await gh(["issue", "view", id, "--json", FIELDS]);
  if (!out.ok) return out;
  const parsed = parseIssue(out.value);
  return parsed === undefined ? trackerError(`gh issue view ${id}: unexpected output`) : ok(parsed);
};

const view = async (gh: Gh, id: string): Promise<TrackerResult<WorkItem>> => {
  const raw = await viewRaw(gh, id);
  return raw.ok ? ok(toItem(raw.value)) : raw;
};

const LIST_LIMIT = 1000;

/** The `gh issue list` arguments that select exactly the wanted status where gh can, so the limit bites last. */
const listArgs = (status: WorkStatus | undefined): string[] => {
  const state = status === undefined ? "all" : STATE_ARG[status];
  const marker = status === "in-progress" ? ["--label", IN_PROGRESS] : [];
  return [
    "issue",
    "list",
    "--state",
    state,
    ...marker,
    "--limit",
    String(LIST_LIMIT),
    "--json",
    FIELDS,
  ];
};

const listIssues = async (gh: Gh, filter: ItemFilter): Promise<TrackerResult<WorkItem[]>> => {
  const out = await gh(listArgs(filter.status));
  if (!out.ok) return out;
  const parsed = parseIssues(out.value);
  if (parsed === undefined) return trackerError("gh issue list: unexpected output");
  // gh lists newest first. Cutting off old closed issues is harmless; cutting off open work is not.
  if (parsed.length >= LIST_LIMIT && filter.status !== "done") {
    const advice =
      filter.status === undefined
        ? "; ask for one status to narrow it"
        : "; this adapter lists at most that many";
    return trackerError(
      `gh issue list returned ${LIST_LIMIT} issues, so the list may be cut short${advice}`,
    );
  }
  const items = parsed.map(toItem);
  return ok(filter.status === undefined ? items : items.filter((i) => i.status === filter.status));
};

const createIssue = async (gh: Gh, input: NewWorkItem): Promise<TrackerResult<WorkItem>> => {
  const problem = unusable({ title: input.title, labels: input.labels ?? [] });
  if (problem !== undefined) return trackerError(problem);
  const labels = (input.labels ?? []).flatMap((l) => ["--label", l]);
  const out = await gh([
    "issue",
    "create",
    "--title",
    input.title,
    "--body",
    input.body ?? "",
    ...labels,
  ]);
  if (!out.ok) return out;
  const number = /\/issues\/(\d+)\s*$/.exec(out.value)?.[1];
  if (number === undefined) return trackerError("gh issue create: no issue URL in the output");
  return view(gh, number);
};

/** Label changes that make the issue's labels exactly `wanted` (plus the in-progress marker when asked for). */
const labelFlags = (current: WorkItem, hadMarker: boolean, patch: WorkItemPatch): string[] => {
  const wanted = patch.labels ?? current.labels;
  const marked = (patch.status ?? current.status) === "in-progress";
  const has = (labels: readonly string[], l: string): boolean =>
    labels.some((x) => x.toLowerCase() === l.toLowerCase());
  const add = [
    ...wanted.filter((l) => !has(current.labels, l)),
    ...(marked && !hadMarker ? [IN_PROGRESS] : []),
  ];
  const remove = [
    ...current.labels.filter((l) => !has(wanted, l)),
    ...(!marked && hadMarker ? [IN_PROGRESS] : []),
  ];
  return [
    ...add.flatMap((l) => ["--add-label", l]),
    ...remove.flatMap((l) => ["--remove-label", l]),
  ];
};

const editFlags = (current: WorkItem, hadMarker: boolean, patch: WorkItemPatch): string[] => [
  ...(patch.title === undefined ? [] : ["--title", patch.title]),
  ...(patch.body === undefined ? [] : ["--body", patch.body]),
  ...(patch.labels === undefined && patch.status === undefined
    ? []
    : labelFlags(current, hadMarker, patch)),
];

/** Closing or reopening only when the issue is not already in the wanted state. */
const stateCommand = (current: WorkItem, status: WorkStatus | undefined): string | undefined => {
  if (status === undefined) return undefined;
  if (status === "done") return current.status === "done" ? undefined : "close";
  return current.status === "done" ? "reopen" : undefined;
};

/**
 * Labels are replaced, as in the repo-files tracker. Apply edits before closing or reopening so an edit
 * failure leaves the issue lifecycle alone. Repository label setup is an explicit owner action.
 */
const updateIssue = async (
  gh: Gh,
  id: string,
  patch: WorkItemPatch,
): Promise<TrackerResult<WorkItem>> => {
  const problem = unusable({ title: patch.title ?? "x", labels: patch.labels ?? [] });
  if (problem !== undefined) return trackerError(problem);
  const raw = await viewRaw(gh, id);
  if (!raw.ok) return raw;
  const current = toItem(raw.value);
  const hadMarker = (raw.value.labels ?? []).some((l) => isMarker(l.name));
  const flags = editFlags(current, hadMarker, patch);
  if (flags.length > 0) {
    const edited = await gh(["issue", "edit", id, ...flags]);
    if (!edited.ok) {
      const addingMarker = flags.some(
        (flag, index) => flag === "--add-label" && flags[index + 1] === IN_PROGRESS,
      );
      return addingMarker
        ? trackerError(
            `${edited.error.message}; if the in-progress label is missing, ask an authorized owner to explicitly create it after reviewing repository conventions. Re-read the issue and repository setup before retrying; the error may instead be a permissions or other edit failure.`,
          )
        : edited;
    }
  }
  const command = stateCommand(current, patch.status);
  if (command !== undefined) {
    const changed = await gh(["issue", command, id]);
    if (!changed.ok) return changed;
  }
  return view(gh, id);
};

const commentIssue = async (gh: Gh, id: string, body: string): Promise<TrackerResult<void>> => {
  if (!ISSUE_NUMBER.test(id)) return notNumber(id);
  const out = await gh(["issue", "comment", id, "--body", body]);
  return out.ok ? ok(undefined) : out;
};

/** Work items as GitHub issues, through the `gh` CLI. Every value is its own argument, never shell text. */
export function createGithubTracker(deps: GithubTrackerDeps): Tracker {
  const gh = bindGh(deps);
  const { repo, projectId } = deps;
  const capabilities =
    repo === undefined ? BASIC_TRACKER_ACTIONS : [...BASIC_TRACKER_ACTIONS, "assign"];
  return {
    kind: "github",
    async inspect(fieldId): Promise<TrackerResult<TrackerInspection>> {
      if (deps.projectId === undefined)
        return fieldId === undefined
          ? ok({ kind: "github", capabilities, project: null })
          : trackerError("fieldId requires an explicitly configured tracker.project_id");
      const project = await inspectProject(
        { exec: deps.exec, cwd: deps.cwd, projectId: deps.projectId },
        fieldId,
      );
      return project.ok
        ? ok({
            kind: "github",
            capabilities:
              deps.repo === undefined
                ? capabilities
                : [
                    ...capabilities,
                    "project-items",
                    "project-member",
                    "project-enroll",
                    "project-set",
                  ],
            project: project.value,
          })
        : project;
    },
    projectItems: (filter) =>
      deps.projectId === undefined || deps.repo === undefined
        ? Promise.resolve(
            trackerError("project-items requires explicit tracker.project_id and tracker.repo"),
          )
        : observeProjectItems(
            { exec: deps.exec, cwd: deps.cwd, repo: deps.repo, projectId: deps.projectId },
            filter,
          ),
    projectMember: (id) =>
      observeProjectMembership(
        { exec: deps.exec, cwd: deps.cwd, repo: deps.repo ?? "", projectId: deps.projectId ?? "" },
        id,
      ),
    projectEnroll: (id) =>
      enrollProjectIssue(
        { exec: deps.exec, cwd: deps.cwd, repo: deps.repo ?? "", projectId: deps.projectId ?? "" },
        id,
      ),
    ...(repo === undefined || projectId === undefined
      ? {}
      : ({
          projectSet: (id, request) =>
            setProjectField({ exec: deps.exec, cwd: deps.cwd, repo, projectId }, id, request),
        } satisfies Pick<Tracker, "projectSet">)),
    assign: (id, request) =>
      repo === undefined
        ? Promise.resolve(trackerError("assign requires explicit tracker.repo"))
        : assignIssue({ exec: deps.exec, cwd: deps.cwd, repo }, id, request),
    list: (filter) => listIssues(gh, filter),
    get: (id) => view(gh, id),
    create: (input) => createIssue(gh, input),
    update: (id, patch) => updateIssue(gh, id, patch),
    comment: (id, body) => commentIssue(gh, id, body),
  };
}
