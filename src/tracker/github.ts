import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { unwritable } from "./item-format.ts";
import {
  type ItemFilter,
  type NewWorkItem,
  type Tracker,
  type TrackerResult,
  trackerError,
  type WorkItem,
  type WorkItemPatch,
  type WorkStatus,
} from "./types.ts";

const FIELDS = "number,title,body,state,labels,comments";
const IN_PROGRESS = "in-progress";
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
  return labels.includes(IN_PROGRESS) ? "in-progress" : "open";
};

const toItem = (issue: GhIssue): WorkItem => {
  const names = (issue.labels ?? []).map((l) => l.name);
  return {
    id: String(issue.number),
    title: issue.title,
    body: issue.body ?? "",
    status: statusOf(issue.state, names),
    labels: names.filter((n) => n !== IN_PROGRESS),
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

const LIST_LIMIT = 500;

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
  if (parsed.length >= LIST_LIMIT) {
    return trackerError(
      `gh issue list returned ${LIST_LIMIT} issues, so the list may be cut short; ask for one status (open, in-progress or done) to narrow it`,
    );
  }
  const items = parsed.map(toItem);
  return ok(filter.status === undefined ? items : items.filter((i) => i.status === filter.status));
};

const createIssue = async (gh: Gh, input: NewWorkItem): Promise<TrackerResult<WorkItem>> => {
  const problem = unwritable({ title: input.title, labels: input.labels ?? [] });
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
  const add = [
    ...wanted.filter((l) => !current.labels.includes(l)),
    ...(marked && !hadMarker ? [IN_PROGRESS] : []),
  ];
  const remove = [
    ...current.labels.filter((l) => !wanted.includes(l)),
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
 * Labels are replaced, as in the repo-files tracker. Order: make sure the marker label exists, apply every
 * edit in one `gh issue edit`, then close or reopen last, so a failure before the state change leaves the
 * issue's open/closed state alone.
 */
const updateIssue = async (
  gh: Gh,
  id: string,
  patch: WorkItemPatch,
): Promise<TrackerResult<WorkItem>> => {
  const problem = unwritable({ title: patch.title ?? "x", labels: patch.labels ?? [] });
  if (problem !== undefined) return trackerError(problem);
  const raw = await viewRaw(gh, id);
  if (!raw.ok) return raw;
  const current = toItem(raw.value);
  const hadMarker = (raw.value.labels ?? []).some((l) => l.name === IN_PROGRESS);
  if (patch.status === "in-progress") {
    // No --force: that would recolour the team's existing label. "Already exists" is success.
    const made = await gh(["label", "create", IN_PROGRESS]);
    if (!(made.ok || /already exists/i.test(made.error.message))) return made;
  }
  const flags = editFlags(current, hadMarker, patch);
  if (flags.length > 0) {
    const edited = await gh(["issue", "edit", id, ...flags]);
    if (!edited.ok) return edited;
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
  return {
    kind: "github",
    list: (filter) => listIssues(gh, filter),
    get: (id) => view(gh, id),
    create: (input) => createIssue(gh, input),
    update: (id, patch) => updateIssue(gh, id, patch),
    comment: (id, body) => commentIssue(gh, id, body),
  };
}
