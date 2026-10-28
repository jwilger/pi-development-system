import type { Result } from "../core/result.ts";

export const WORK_STATUSES = ["open", "in-progress", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export type WorkItem = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: WorkStatus;
  readonly labels: readonly string[];
  readonly comments: readonly string[];
};

export type NewWorkItem = {
  readonly title: string;
  readonly body?: string;
  readonly labels?: readonly string[];
};

export type WorkItemPatch = Partial<Pick<WorkItem, "title" | "body" | "status" | "labels">>;

export type ItemFilter = { readonly status?: WorkStatus };

export type TrackerError = { readonly kind: "tracker-error"; readonly message: string };

export type TrackerResult<T> = Result<T, TrackerError>;

export type ProjectField = {
  readonly id: string;
  readonly name: string;
  readonly dataType: string;
  readonly options?: readonly { readonly id: string; readonly name: string }[];
};

export type ProjectInspection = {
  readonly id: string;
  readonly owner: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly fields: readonly ProjectField[];
};

export type ProjectItemFilter = {
  readonly lifecycle?: "open" | "closed";
  readonly fieldId?: string;
  readonly optionId?: string;
};

export type ProjectValue = { readonly fieldId: string } & (
  | {
      readonly type: "single-select";
      readonly optionId: string | null;
      readonly name: string | null;
    }
  | { readonly type: "text" | "date"; readonly value: string }
  | { readonly type: "number"; readonly value: number }
  | { readonly type: "unsupported"; readonly typename: string }
);

export type ProjectIssueObservation = {
  readonly itemId: string;
  readonly issueId: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly lifecycle: "open" | "closed";
  readonly archived: boolean;
  readonly fields: readonly ProjectValue[];
};

export type ProjectDiagnostic = {
  readonly itemId: string;
  readonly kind: "archived" | "redacted" | "foreign-repository" | "pull-request" | "draft";
  readonly message: string;
};

export type ProjectItems = {
  readonly projectId: string;
  readonly repository: string;
  readonly order: "api-observation-not-priority";
  readonly eligibility: "unassessed" | "unknown";
  readonly issues: readonly ProjectIssueObservation[];
  readonly diagnostics: readonly ProjectDiagnostic[];
};

export type TrackerInspection = {
  readonly kind: string;
  readonly capabilities: readonly string[];
  readonly project: ProjectInspection | null;
};

export const BASIC_TRACKER_ACTIONS = [
  "inspect",
  "list",
  "get",
  "create",
  "update",
  "comment",
] as const;

/** Where work items live. One adapter per `[tracker] kind`; callers never see the backend. */
export interface Tracker {
  readonly kind: string;
  inspect?(fieldId?: string): Promise<TrackerResult<TrackerInspection>>;
  projectItems?(filter: ProjectItemFilter): Promise<TrackerResult<ProjectItems>>;
  list(filter: ItemFilter): Promise<TrackerResult<WorkItem[]>>;
  get(id: string): Promise<TrackerResult<WorkItem>>;
  create(item: NewWorkItem): Promise<TrackerResult<WorkItem>>;
  update(id: string, patch: WorkItemPatch): Promise<TrackerResult<WorkItem>>;
  comment(id: string, body: string): Promise<TrackerResult<void>>;
}

export const trackerError = (message: string): { ok: false; error: TrackerError } => ({
  ok: false,
  error: { kind: "tracker-error", message },
});
