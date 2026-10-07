import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ok } from "../core/result.ts";
import { parseItem, renderBacklog, renderItem, unwritable } from "./item-format.ts";
import {
  type ItemFilter,
  type NewWorkItem,
  type Tracker,
  type TrackerResult,
  trackerError,
  type WorkItem,
  type WorkItemPatch,
} from "./types.ts";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const ID_MAX = 60;

const slugOf = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, ID_MAX)
    .replace(/-+$/, "");

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";

const itemsDir = (root: string): string => join(root, "work", "items");
const fileOf = (root: string, id: string): string => join(itemsDir(root), `${id}.md`);
const byCodeUnit = (a: string, b: string): number => Number(a > b) - Number(a < b);

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const readItem = async (root: string, id: string): Promise<TrackerResult<WorkItem>> => {
  if (!ID.test(id)) return trackerError(`work item "${id}": not a valid id`);
  try {
    return parseItem(id, await readFile(fileOf(root, id), "utf8"));
  } catch (cause) {
    if (isMissing(cause)) return trackerError(`work item "${id}" does not exist`);
    return trackerError(`work item "${id}": ${describe(cause)}`);
  }
};

const itemIds = async (root: string): Promise<string[]> => {
  try {
    const files = await readdir(itemsDir(root));
    return files.flatMap((f) => (f.endsWith(".md") ? [f.slice(0, -3)] : []));
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
};

const readAll = async (root: string): Promise<TrackerResult<WorkItem[]>> => {
  const items: WorkItem[] = [];
  for (const id of (await itemIds(root)).toSorted(byCodeUnit)) {
    const item = await readItem(root, id);
    if (!item.ok) return item;
    items.push(item.value);
  }
  return ok(items);
};

const save = async (root: string, item: WorkItem): Promise<TrackerResult<WorkItem>> => {
  const problem = unwritable(item);
  if (problem !== undefined) return trackerError(problem);
  await mkdir(itemsDir(root), { recursive: true });
  await writeFile(fileOf(root, item.id), renderItem(item));
  const items = await readAll(root);
  if (!items.ok) return items;
  await writeFile(join(root, "work", "backlog.md"), renderBacklog(items.value));
  return ok(item);
};

const freshId = async (root: string, title: string): Promise<string | undefined> => {
  const base = slugOf(title);
  if (base === "") return undefined;
  const taken = new Set(await itemIds(root));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

const listItems = async (root: string, filter: ItemFilter): Promise<TrackerResult<WorkItem[]>> => {
  const items = await readAll(root);
  if (!items.ok || filter.status === undefined) return items;
  return ok(items.value.filter((i) => i.status === filter.status));
};

const createItem = async (root: string, input: NewWorkItem): Promise<TrackerResult<WorkItem>> => {
  const problem = unwritable({ title: input.title, labels: input.labels ?? [] });
  if (problem !== undefined) return trackerError(problem);
  const id = await freshId(root, input.title);
  if (id === undefined) return trackerError("a work item title needs letters or digits");
  return save(root, {
    id,
    title: input.title,
    body: input.body ?? "",
    status: "open",
    labels: input.labels ?? [],
    comments: [],
  });
};

const updateItem = async (
  root: string,
  id: string,
  patch: WorkItemPatch,
): Promise<TrackerResult<WorkItem>> => {
  const current = await readItem(root, id);
  return current.ok ? save(root, { ...current.value, ...patch }) : current;
};

const commentItem = async (
  root: string,
  id: string,
  body: string,
): Promise<TrackerResult<void>> => {
  const current = await readItem(root, id);
  if (!current.ok) return current;
  const saved = await save(root, { ...current.value, comments: [...current.value.comments, body] });
  return saved.ok ? ok(undefined) : saved;
};

/** Work items as markdown files in the repo: `work/items/<id>.md`, with a derived `work/backlog.md`. */
export function createRepoFilesTracker(root: string): Tracker {
  return {
    kind: "repo-files",
    list: (filter) => listItems(root, filter),
    get: (id) => readItem(root, id),
    create: (input) => createItem(root, input),
    update: (id, patch) => updateItem(root, id, patch),
    comment: (id, body) => commentItem(root, id, body),
  };
}
