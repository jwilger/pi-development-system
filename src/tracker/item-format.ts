import { ok } from "../core/result.ts";
import {
  type TrackerResult,
  trackerError,
  WORK_STATUSES,
  type WorkItem,
  type WorkStatus,
} from "./types.ts";

const COMMENTS = "\n## Comments\n";

export const renderItem = (item: WorkItem): string => {
  const comments = item.comments.map((c) => `\n### Comment\n\n${c}\n`).join("");
  return [
    `# ${item.title}`,
    "",
    `Status: ${item.status}`,
    `Labels: ${item.labels.join(", ")}`,
    "",
    item.body,
    COMMENTS + comments,
  ].join("\n");
};

const isStatus = (value: string): value is WorkStatus =>
  (WORK_STATUSES as readonly string[]).includes(value);

const commentsOf = (section: string): string[] =>
  section
    .split(/^### Comment\n\n/m)
    .slice(1)
    .map((c) => c.replace(/\n$/, "").replace(/\n$/, ""));

export const parseItem = (id: string, text: string): TrackerResult<WorkItem> => {
  const marker = text.lastIndexOf(COMMENTS);
  const main = marker < 0 ? text : text.slice(0, marker);
  const comments = marker < 0 ? [] : commentsOf(text.slice(marker + COMMENTS.length));
  const head = /^# (.+)\n\nStatus: (.*)\nLabels: (.*)\n\n?/.exec(main);
  if (head === null)
    return trackerError(`work item ${id}: expected "# title", Status and Labels lines`);
  const [whole, title = "", status = "", labels = ""] = head;
  if (!isStatus(status)) {
    return trackerError(
      `work item ${id}: unknown status "${status}" (use ${WORK_STATUSES.join(", ")})`,
    );
  }
  return ok({
    id,
    title,
    body: main.slice(whole.length).replace(/\n$/, ""),
    status,
    labels: labels === "" ? [] : labels.split(", "),
    comments,
  });
};

const RANK: Record<WorkStatus, number> = { "in-progress": 1, open: 0, done: 2 };

/** Derived from the item files on every change, so it cannot drift from them. */
export const renderBacklog = (items: readonly WorkItem[]): string => {
  const ordered = items.toSorted((a, b) => RANK[a.status] - RANK[b.status]);
  const lines = ordered.map((i) => {
    const note = i.status === "in-progress" ? " (in-progress)" : "";
    return `- [${i.status === "done" ? "x" : " "}] ${i.id} — ${i.title}${note}`;
  });
  return ["# Backlog", "", ...lines, ""].join("\n");
};
