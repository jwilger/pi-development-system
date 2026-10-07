import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
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

/** ASCII id from a title: accents are folded (Résumé → resume); a title with no ASCII letters or digits becomes `item`. */
const slugOf = (title: string): string =>
  title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
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

/**
 * The first symlink on the way from the repo root to `target`, if any. A committed symlink
 * under `work/` could otherwise make a tracker write land outside the repository.
 */
const symlinkOnPath = async (root: string, target: string): Promise<string | undefined> => {
  let current = root;
  for (const part of relative(root, target).split(sep)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) return current;
    } catch (cause) {
      if (isMissing(cause)) return undefined;
      throw cause;
    }
  }
  return undefined;
};

const refuseSymlink = async (root: string, target: string): Promise<string | undefined> => {
  const link = await symlinkOnPath(root, target);
  return link === undefined
    ? undefined
    : `${relative(root, link)} is a symbolic link; the repo-files tracker will not follow it`;
};

const readItem = async (root: string, id: string): Promise<TrackerResult<WorkItem>> => {
  if (!ID.test(id)) return trackerError(`work item "${id}": not a valid id`);
  const link = await refuseSymlink(root, fileOf(root, id));
  if (link !== undefined) return trackerError(link);
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
    return files.flatMap((f) =>
      f.endsWith(".md") && ID.test(f.slice(0, -3)) ? [f.slice(0, -3)] : [],
    );
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
};

const readAll = async (root: string): Promise<TrackerResult<WorkItem[]>> => {
  const link = await refuseSymlink(root, itemsDir(root));
  if (link !== undefined) return trackerError(link);
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
  const backlog = join(root, "work", "backlog.md");
  for (const target of [itemsDir(root), fileOf(root, item.id), backlog]) {
    const link = await refuseSymlink(root, target);
    if (link !== undefined) return trackerError(link);
  }
  const others = await readAll(root);
  if (!others.ok) return others;
  await mkdir(itemsDir(root), { recursive: true });
  await writeFile(fileOf(root, item.id), renderItem(item));
  const items = [...others.value.filter((i) => i.id !== item.id), item].toSorted((a, b) =>
    byCodeUnit(a.id, b.id),
  );
  await writeFile(backlog, renderBacklog(items));
  return ok(item);
};

const freshId = async (root: string, title: string): Promise<string> => {
  const base = slugOf(title) || "item";
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
  return save(root, {
    id: await freshId(root, input.title),
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
