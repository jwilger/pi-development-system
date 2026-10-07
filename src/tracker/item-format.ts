import { ok } from "../core/result.ts";
import {
  type TrackerResult,
  trackerError,
  WORK_STATUSES,
  type WorkItem,
  type WorkStatus,
} from "./types.ts";

/** Every line terminator `.` in the item header pattern cannot cross, plus NEL for safety. */
const LINE_BREAK = /[\r\n\u2028\u2029\u0085]/;

const COMMENTS = "\n## Comments\n";

/** Comment lines are quoted so nothing a comment says can look like one of our headings. */
const quote = (text: string): string =>
  text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");

const unquote = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n");

/** What the file format cannot hold, or undefined when the item can be written and read back. */
export const unwritable = (item: Pick<WorkItem, "title" | "labels">): string | undefined => {
  if (LINE_BREAK.test(item.title)) return "a work item title must be a single line";
  if (item.title.trim() === "") return "a work item title cannot be blank";
  const bad = item.labels.find((l) => LINE_BREAK.test(l) || l.includes(",") || l.trim() === "");
  return bad === undefined
    ? undefined
    : `label ${JSON.stringify(bad)} is blank or holds a comma or line break`;
};

/** Written to pass our own markdownlint: no trailing space, no repeated heading text, no stacked blank lines. */
export const renderItem = (item: WorkItem): string => {
  const labels = item.labels.length === 0 ? "" : ` ${item.labels.join(", ")}`;
  const top = `# ${item.title}\n\nStatus: ${item.status}\nLabels:${labels}`;
  const body = item.body === "" ? [] : [item.body];
  const comments = item.comments.map((c, n) => `\n### Comment ${n + 1}\n\n${quote(c)}\n`);
  return `${[top, ...body, "## Comments"].join("\n\n")}\n${comments.join("")}`;
};

const isStatus = (value: string): value is WorkStatus =>
  (WORK_STATUSES as readonly string[]).includes(value);

const commentsOf = (section: string): string[] =>
  section
    .split(/^### Comment(?: \d+)?\n\n/m)
    .slice(1)
    .map((c) => unquote(c.replace(/\n+$/, "")));

export const parseItem = (id: string, raw: string): TrackerResult<WorkItem> => {
  const text = raw.replace(/\r\n?/g, "\n");
  const marker = text.lastIndexOf(COMMENTS);
  const main = marker < 0 ? text : text.slice(0, marker);
  const comments = marker < 0 ? [] : commentsOf(text.slice(marker + COMMENTS.length));
  const head = /^# (.+)\n\nStatus: (.*)\nLabels:[ ]?(.*)(?:\n\n|\n$|$)/.exec(main);
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
