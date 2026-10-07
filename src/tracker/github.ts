import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
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

const view = async (gh: Gh, id: string): Promise<TrackerResult<WorkItem>> => {
  if (!ISSUE_NUMBER.test(id)) return notNumber(id);
  const out = await gh(["issue", "view", id, "--json", FIELDS]);
  if (!out.ok) return out;
  const parsed = parseIssue(out.value);
  return parsed === undefined
    ? trackerError(`gh issue view ${id}: unexpected output`)
    : ok(toItem(parsed));
};

const listIssues = async (gh: Gh, filter: ItemFilter): Promise<TrackerResult<WorkItem[]>> => {
  const state = filter.status === undefined ? "all" : STATE_ARG[filter.status];
  const out = await gh(["issue", "list", "--state", state, "--limit", "200", "--json", FIELDS]);
  if (!out.ok) return out;
  const parsed = parseIssues(out.value);
  if (parsed === undefined) return trackerError("gh issue list: unexpected output");
  const items = parsed.map(toItem);
  return ok(filter.status === undefined ? items : items.filter((i) => i.status === filter.status));
};

const createIssue = async (gh: Gh, input: NewWorkItem): Promise<TrackerResult<WorkItem>> => {
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

const applyStatus = async (
  gh: Gh,
  id: string,
  status: WorkStatus,
): Promise<TrackerResult<string>> => {
  if (status === "done") return gh(["issue", "close", id]);
  // Reopening an issue that is already open fails; only the label change below decides the result.
  await gh(["issue", "reopen", id]);
  const flag = status === "in-progress" ? "--add-label" : "--remove-label";
  return gh(["issue", "edit", id, flag, IN_PROGRESS]);
};

const editArgs = (patch: WorkItemPatch): string[] => [
  ...(patch.title === undefined ? [] : ["--title", patch.title]),
  ...(patch.body === undefined ? [] : ["--body", patch.body]),
  ...(patch.labels ?? []).flatMap((label) => ["--add-label", label]),
];

const updateIssue = async (
  gh: Gh,
  id: string,
  patch: WorkItemPatch,
): Promise<TrackerResult<WorkItem>> => {
  if (!ISSUE_NUMBER.test(id)) return notNumber(id);
  const edits = editArgs(patch);
  if (edits.length > 0) {
    const edited = await gh(["issue", "edit", id, ...edits]);
    if (!edited.ok) return edited;
  }
  if (patch.status !== undefined) {
    const changed = await applyStatus(gh, id, patch.status);
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
