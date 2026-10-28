import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse as parseToml } from "smol-toml";
import { defaultMatrix, isSlot, type ModelMatrix, SLOTS, type Slot } from "../core/models.ts";
import { err, ok, type Result } from "../core/result.ts";
import type { Route } from "../core/routing.ts";
import { THINKING_LEVELS, type ThinkingLevel } from "../core/spawn-overrides.ts";

export const CONFIG_FILE = ".development-system.toml";
/** Machine-local config in pi's agent directory; holds only `[models]` candidates for this pi. */
export const USER_CONFIG_FILE = "development-system.toml";

const DELIVERY_MODES = ["trunk", "pull-request", "local-only"] as const;
const TRACKER_KINDS = ["repo-files", "github", "jira", "linear"] as const;

type DeliveryMode = (typeof DELIVERY_MODES)[number];
type TrackerKind = (typeof TRACKER_KINDS)[number];

export type ConfigError = {
  readonly kind: "config-error";
  readonly message: string;
  readonly key?: string;
  /** File the error is in, when it is not the repository's `.development-system.toml`. */
  readonly file?: string;
};

export type DevsysConfig = {
  readonly delivery: {
    readonly mode: DeliveryMode;
    readonly trunk: string;
    readonly remote: string;
  };
  readonly review: {
    readonly requiredCleanRounds: number;
    readonly minRounds: number;
    /** Effort of the reviewer and lens agents that devsys_review_start and devsys_lens_review spawn. */
    readonly thinkingLevel: ThinkingLevel;
  };
  readonly workflow: { readonly guidance: readonly string[] };
  readonly tracker: {
    readonly kind: TrackerKind;
    readonly repo?: string;
    readonly projectId?: string;
  };
  readonly profiles: { readonly override: readonly string[] };
  readonly models: ModelMatrix;
  readonly routing: Readonly<Record<string, Route>>;
  readonly verifier: { readonly maxPerSession: number };
  readonly cadence: { readonly pushMinutes: number };
  readonly eventModel: { readonly provider: string };
};

const DEFAULT_ROUTING: Readonly<Record<string, Route>> = {
  "trivial/low": { slot: "fast", thinkingLevel: "low" },
  "trivial/*": { slot: "implementer", thinkingLevel: "medium" },
  "routine/low": { slot: "implementer", thinkingLevel: "medium" },
  "routine/*": { slot: "strong", thinkingLevel: "high" },
  "complex/*": { slot: "strong", thinkingLevel: "high" },
  "expert/*": { slot: "frontier", thinkingLevel: "high" },
};

/** `<file>: <message>`, naming the repository config unless the error is in another file. */
export const configErrorText = (error: ConfigError): string =>
  `${error.file ?? CONFIG_FILE}: ${error.message}`;

const fail = (message: string, key?: string): Result<never, ConfigError> =>
  err(
    key === undefined ? { kind: "config-error", message } : { kind: "config-error", message, key },
  );

type Table = Readonly<Record<string, unknown>>;

const isTable = (value: unknown): value is Table =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

const qualified = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);

/** The `[path]` table (or defaults when absent), rejecting any key outside `allowed`. */
function section(
  root: Table,
  name: string,
  allowed: readonly string[],
): Result<Table, ConfigError> {
  const raw = root[name];
  if (raw === undefined) return ok({});
  if (!isTable(raw)) return fail(`${name} must be a table`, name);
  const unknown = Object.keys(raw).find((k) => !allowed.includes(k));
  return unknown === undefined
    ? ok(raw)
    : fail(`unknown key ${qualified(name, unknown)}`, qualified(name, unknown));
}

function text(t: Table, path: string, key: string, fallback: string): Result<string, ConfigError> {
  const v = t[key];
  if (v === undefined) return ok(fallback);
  return typeof v === "string" && v !== ""
    ? ok(v)
    : fail(`${qualified(path, key)} must be a non-empty string`, qualified(path, key));
}

function choice<T extends string>(
  t: Table,
  path: string,
  key: string,
  options: readonly T[],
  fallback: T,
): Result<T, ConfigError> {
  const v = t[key];
  if (v === undefined) return ok(fallback);
  const found = options.find((o) => o === v);
  return found !== undefined
    ? ok(found)
    : fail(`${qualified(path, key)} must be one of ${options.join(" | ")}`, qualified(path, key));
}

function number(
  t: Table,
  path: string,
  key: string,
  fallback: number,
  bounds: { min: number; max: number; integer: boolean },
): Result<number, ConfigError> {
  const v = t[key];
  if (v === undefined) return ok(fallback);
  const valid =
    typeof v === "number" &&
    v >= bounds.min &&
    v <= bounds.max &&
    (!bounds.integer || Number.isInteger(v));
  if (valid) return ok(v);
  const kind = bounds.integer ? "an integer" : "a number";
  return fail(
    `${qualified(path, key)} must be ${kind} between ${bounds.min} and ${bounds.max}`,
    qualified(path, key),
  );
}

const POSITIVE = { min: 1, max: 1_000_000, integer: true };

const MODEL_CANDIDATE = /^(@[a-z]+|[^/\s]+\/\S+)$/;

const knownSlotRef = (c: string): boolean => !c.startsWith("@") || isSlot(c.slice(1));

function candidates(raw: unknown, key: string): Result<readonly string[], ConfigError> {
  const valid =
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((c) => typeof c === "string" && MODEL_CANDIDATE.test(c) && knownSlotRef(c));
  return valid
    ? ok(raw.map(String))
    : fail(
        `${key} must be a non-empty array of "provider/id", "provider/family-*" or "@slot" strings`,
        key,
      );
}

type SlotCandidates = Partial<Record<Slot, readonly string[]>>;

function slotCandidates(root: Table): Result<SlotCandidates, ConfigError> {
  const table = section(root, "models", SLOTS);
  if (!table.ok) return table;
  const found: SlotCandidates = {};
  for (const [slot, raw] of Object.entries(table.value)) {
    if (!isSlot(slot)) continue;
    const parsed = candidates(raw, `models.${slot}`);
    if (!parsed.ok) return parsed;
    found[slot] = parsed.value;
  }
  return ok(found);
}

function models(root: Table): Result<ModelMatrix, ConfigError> {
  const found = slotCandidates(root);
  return found.ok ? ok({ ...defaultMatrix(), ...found.value }) : found;
}

function route(raw: unknown, key: string): Result<Route, ConfigError> {
  const [slot, level] = Array.isArray(raw) ? raw : [];
  const valid =
    Array.isArray(raw) &&
    raw.length === 2 &&
    typeof slot === "string" &&
    isSlot(slot) &&
    THINKING_LEVELS.some((l) => l === level);
  if (!valid || typeof slot !== "string" || !isSlot(slot)) {
    return fail(
      `${key} must be [slot, thinkingLevel] (levels: ${THINKING_LEVELS.join(", ")})`,
      key,
    );
  }
  const thinkingLevel = THINKING_LEVELS.find((l) => l === level);
  return thinkingLevel === undefined
    ? fail(`${key} has an unknown thinking level`, key)
    : ok({ slot, thinkingLevel });
}

const ROUTING_KEY = /^(?:trivial|routine|complex|expert|\*)\/(?:low|medium|high|\*)$/;

function routing(root: Table): Result<Readonly<Record<string, Route>>, ConfigError> {
  const raw = root.routing;
  if (raw === undefined) return ok(DEFAULT_ROUTING);
  if (!isTable(raw)) return fail("routing must be a table", "routing");
  const result: Record<string, Route> = {};
  for (const [pattern, value] of Object.entries(raw)) {
    if (!ROUTING_KEY.test(pattern)) {
      return fail(
        `routing.${pattern}: key must be <difficulty>/<risk>, each a level or *`,
        `routing.${pattern}`,
      );
    }
    const parsed = route(value, `routing.${pattern}`);
    if (!parsed.ok) return parsed;
    result[pattern] = parsed.value;
  }
  return ok(result);
}

function profiles(root: Table): Result<readonly string[], ConfigError> {
  const table = section(root, "profiles", ["override"]);
  if (!table.ok) return table;
  const raw = table.value.override;
  if (raw === undefined) return ok([]);
  return Array.isArray(raw) && raw.every((p) => typeof p === "string")
    ? ok(raw.map(String))
    : fail("profiles.override must be an array of strings", "profiles.override");
}

function workflow(root: Table): Result<DevsysConfig["workflow"], ConfigError> {
  const table = section(root, "workflow", ["guidance"]);
  if (!table.ok) return table;
  const raw = table.value.guidance ?? [];
  return Array.isArray(raw) && raw.every((path) => typeof path === "string" && path.trim() !== "")
    ? ok({ guidance: raw.map(String) })
    : fail("workflow.guidance must be an array of non-empty paths", "workflow.guidance");
}

const TOP_LEVEL = [
  "version",
  "delivery",
  "review",
  "tracker",
  "profiles",
  "models",
  "routing",
  "verifier",
  "cadence",
  "event_model",
  "workflow",
];

function deliveryAndReview(
  root: Table,
): Result<Pick<DevsysConfig, "delivery" | "review" | "tracker">, ConfigError> {
  const d = section(root, "delivery", ["mode", "trunk", "remote"]);
  const r = section(root, "review", ["required_clean_rounds", "min_rounds", "thinking_level"]);
  const t = section(root, "tracker", ["kind", "repo", "project_id"]);
  if (!d.ok) return d;
  if (!r.ok) return r;
  if (!t.ok) return t;
  const mode = choice(d.value, "delivery", "mode", DELIVERY_MODES, "trunk");
  const trunk = text(d.value, "delivery", "trunk", "main");
  const remote = text(d.value, "delivery", "remote", "origin");
  const required = number(r.value, "review", "required_clean_rounds", 3, POSITIVE);
  const min = number(r.value, "review", "min_rounds", 1, POSITIVE);
  const effort = choice(r.value, "review", "thinking_level", THINKING_LEVELS, "high");
  const kind = choice(t.value, "tracker", "kind", TRACKER_KINDS, "repo-files");
  const repo = t.value.repo === undefined ? ok(undefined) : text(t.value, "tracker", "repo", "");
  const projectId =
    t.value.project_id === undefined ? ok(undefined) : text(t.value, "tracker", "project_id", "");
  for (const field of [mode, trunk, remote, required, min, effort, kind, repo, projectId])
    if (!field.ok) return field;
  if (
    !(
      mode.ok &&
      trunk.ok &&
      remote.ok &&
      required.ok &&
      min.ok &&
      effort.ok &&
      kind.ok &&
      repo.ok &&
      projectId.ok
    )
  ) {
    return fail("unreachable");
  }
  if (
    projectId.value !== undefined &&
    (kind.value !== "github" || !/^[A-Za-z0-9_+/=-]{1,256}$/.test(projectId.value))
  )
    return fail(
      "tracker.project_id must be an opaque GitHub Project node id and requires kind = github",
      "tracker.project_id",
    );
  return ok({
    delivery: { mode: mode.value, trunk: trunk.value, remote: remote.value },
    review: {
      requiredCleanRounds: required.value,
      minRounds: min.value,
      thinkingLevel: effort.value,
    },
    tracker: {
      kind: kind.value,
      ...(repo.value === undefined ? {} : { repo: repo.value }),
      ...(projectId.value === undefined ? {} : { projectId: projectId.value }),
    },
  });
}

function limits(
  root: Table,
): Result<Pick<DevsysConfig, "verifier" | "cadence" | "eventModel">, ConfigError> {
  const v = section(root, "verifier", ["max_per_session"]);
  const c = section(root, "cadence", ["push_minutes"]);
  const e = section(root, "event_model", ["provider"]);
  if (!v.ok) return v;
  if (!c.ok) return c;
  if (!e.ok) return e;
  const max = number(v.value, "verifier", "max_per_session", 6, POSITIVE);
  const push = number(c.value, "cadence", "push_minutes", 60, POSITIVE);
  const provider = text(e.value, "event_model", "provider", "builtin");
  if (!max.ok) return max;
  if (!push.ok) return push;
  if (!provider.ok) return provider;
  return ok({
    verifier: { maxPerSession: max.value },
    cadence: { pushMinutes: push.value },
    eventModel: { provider: provider.value },
  });
}

/** Parses the text of `.development-system.toml` (plan Appendix B); absent keys take defaults. */
export function parseConfig(source: string): Result<DevsysConfig, ConfigError> {
  let root: Table;
  try {
    root = parseToml(source);
  } catch (cause) {
    return fail(`invalid TOML: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const unknown = Object.keys(root).find((k) => !TOP_LEVEL.includes(k));
  if (unknown !== undefined) return fail(`unknown key ${unknown}`, unknown);
  if (root.version !== undefined && root.version !== 1) {
    return fail("version must be 1", "version");
  }
  const delivery = deliveryAndReview(root);
  const lim = limits(root);
  const matrix = models(root);
  const routes = routing(root);
  const prof = profiles(root);
  const localWorkflow = workflow(root);
  if (!delivery.ok) return delivery;
  if (!lim.ok) return lim;
  if (!matrix.ok) return matrix;
  if (!routes.ok) return routes;
  if (!prof.ok) return prof;
  if (!localWorkflow.ok) return localWorkflow;
  return ok({
    ...delivery.value,
    ...lim.value,
    profiles: { override: prof.value },
    workflow: localWorkflow.value,
    models: matrix.value,
    routing: routes.value,
  });
}

const isMissingFile = (cause: unknown): boolean =>
  cause instanceof Error && "code" in cause && String(cause.code) === "ENOENT";

/** Parses a user config: `version` and `[models]` only, since policy belongs to the repo. */
function parseUserConfig(source: string): Result<SlotCandidates, ConfigError> {
  let root: Table;
  try {
    root = parseToml(source);
  } catch (cause) {
    return fail(`invalid TOML: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const unknown = Object.keys(root).find((k) => k !== "version" && k !== "models");
  if (unknown !== undefined) return fail(`unknown key ${unknown}`, unknown);
  if (root.version !== undefined && root.version !== 1) {
    return fail("version must be 1", "version");
  }
  return slotCandidates(root);
}

/** Puts each slot's user candidates ahead of the repo's, dropping repeats. */
export function withUserModels(matrix: ModelMatrix, user: SlotCandidates): ModelMatrix {
  const merged: Record<Slot, readonly string[]> = { ...matrix };
  for (const slot of SLOTS) {
    const local = user[slot];
    if (local === undefined) continue;
    merged[slot] = [...local, ...matrix[slot].filter((c) => !local.includes(c))];
  }
  return merged;
}

type ReadOutcome = Result<string | undefined, ConfigError>;

async function readOptional(path: string, label: string): Promise<ReadOutcome> {
  try {
    return ok(await readFile(path, "utf8"));
  } catch (cause) {
    if (isMissingFile(cause)) return ok(undefined);
    return fail(`cannot read ${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** Reads `<userDir>/development-system.toml`; a missing file means no user candidates. */
export async function loadUserModels(
  userDir: string,
): Promise<Result<SlotCandidates, ConfigError>> {
  const path = join(userDir, USER_CONFIG_FILE);
  const source = await readOptional(path, "it");
  if (!source.ok) return err({ ...source.error, file: path });
  if (source.value === undefined) return ok({});
  const parsed = parseUserConfig(source.value);
  return parsed.ok ? parsed : err({ ...parsed.error, file: path });
}

export type LoadOptions = {
  /** Directory holding the user config; defaults to pi's agent directory, `null` skips it. */
  readonly userDir?: string | null;
};

/**
 * For callers that read only repository policy (delivery, tracker, cadence...): a broken user
 * config must not block a push or a tracker call that never uses its models.
 */
export const POLICY_ONLY: LoadOptions = { userDir: null };

/**
 * Reads `<repoRoot>/.development-system.toml` (a missing file means all defaults), then puts
 * the user config's `[models]` candidates ahead of the repo's for each slot.
 */
export async function loadConfig(
  repoRoot: string,
  options: LoadOptions = {},
): Promise<Result<DevsysConfig, ConfigError>> {
  const source = await readOptional(join(repoRoot, CONFIG_FILE), CONFIG_FILE);
  if (!source.ok) return source;
  const repo = parseConfig(source.value ?? "");
  const userDir = options.userDir === undefined ? getAgentDir() : options.userDir;
  if (!repo.ok || userDir === null) return repo;
  const user = await loadUserModels(userDir);
  if (!user.ok) return user;
  return ok({ ...repo.value, models: withUserModels(repo.value.models, user.value) });
}

export type LoadedModels = {
  readonly models: ModelMatrix;
  /** Why the user config was ignored, when it could not be read or parsed. */
  readonly userError?: ConfigError;
};

/**
 * The effective model matrix for callers that must keep working with a broken user config:
 * a user-config error falls back to the repository's matrix and is returned for reporting.
 */
export async function loadModels(
  repoRoot: string,
  options: LoadOptions = {},
): Promise<Result<LoadedModels, ConfigError>> {
  const repo = await loadConfig(repoRoot, POLICY_ONLY);
  if (!repo.ok) return repo;
  const userDir = options.userDir === undefined ? getAgentDir() : options.userDir;
  if (userDir === null) return ok({ models: repo.value.models });
  const user = await loadUserModels(userDir);
  return user.ok
    ? ok({ models: withUserModels(repo.value.models, user.value) })
    : ok({ models: repo.value.models, userError: user.error });
}
