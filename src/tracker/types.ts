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

/** Where work items live. One adapter per `[tracker] kind`; callers never see the backend. */
export interface Tracker {
  readonly kind: string;
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
