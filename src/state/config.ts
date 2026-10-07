import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { defaultMatrix, isSlot, type ModelMatrix, SLOTS, type Slot } from "../core/models.ts";
import { err, ok, type Result } from "../core/result.ts";
import type { Route } from "../core/routing.ts";
import { THINKING_LEVELS } from "../core/spawn-overrides.ts";

export const CONFIG_FILE = ".development-system.toml";

const DELIVERY_MODES = ["trunk", "pull-request", "local-only"] as const;
const TRACKER_KINDS = ["repo-files", "github", "jira", "linear"] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export type TrackerKind = (typeof TRACKER_KINDS)[number];

export type ConfigError = {
  readonly kind: "config-error";
  readonly message: string;
  readonly key?: string;
};

export type DevsysConfig = {
  readonly delivery: {
    readonly mode: DeliveryMode;
    readonly trunk: string;
    readonly remote: string;
  };
  readonly review: { readonly requiredCleanRounds: number; readonly minRounds: number };
  readonly tracker: { readonly kind: TrackerKind; readonly repo?: string };
  readonly profiles: { readonly override: readonly string[] };
  readonly models: ModelMatrix;
  readonly routing: Readonly<Record<string, Route>>;
  readonly jev: { readonly timeoutMs: number; readonly confidenceFloor: number };
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

function models(root: Table): Result<ModelMatrix, ConfigError> {
  const table = section(root, "models", SLOTS);
  if (!table.ok) return table;
  const merged: Record<Slot, readonly string[]> = { ...defaultMatrix() };
  for (const [slot, raw] of Object.entries(table.value)) {
    if (!isSlot(slot)) continue;
    const parsed = candidates(raw, `models.${slot}`);
    if (!parsed.ok) return parsed;
    merged[slot] = parsed.value;
  }
  return ok(merged);
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

function routing(root: Table): Result<Readonly<Record<string, Route>>, ConfigError> {
  const raw = root.routing;
  if (raw === undefined) return ok(DEFAULT_ROUTING);
  if (!isTable(raw)) return fail("routing must be a table", "routing");
  const result: Record<string, Route> = {};
  for (const [pattern, value] of Object.entries(raw)) {
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

const TOP_LEVEL = [
  "version",
  "delivery",
  "review",
  "tracker",
  "profiles",
  "models",
  "routing",
  "jev",
  "verifier",
  "cadence",
  "event_model",
];

function deliveryAndReview(
  root: Table,
): Result<Pick<DevsysConfig, "delivery" | "review" | "tracker">, ConfigError> {
  const d = section(root, "delivery", ["mode", "trunk", "remote"]);
  const r = section(root, "review", ["required_clean_rounds", "min_rounds"]);
  const t = section(root, "tracker", ["kind", "repo"]);
  if (!d.ok) return d;
  if (!r.ok) return r;
  if (!t.ok) return t;
  const mode = choice(d.value, "delivery", "mode", DELIVERY_MODES, "trunk");
  const trunk = text(d.value, "delivery", "trunk", "main");
  const remote = text(d.value, "delivery", "remote", "origin");
  const required = number(r.value, "review", "required_clean_rounds", 3, POSITIVE);
  const min = number(r.value, "review", "min_rounds", 1, POSITIVE);
  const kind = choice(t.value, "tracker", "kind", TRACKER_KINDS, "repo-files");
  const repo = t.value.repo === undefined ? ok(undefined) : text(t.value, "tracker", "repo", "");
  for (const field of [mode, trunk, remote, required, min, kind, repo]) if (!field.ok) return field;
  if (!(mode.ok && trunk.ok && remote.ok && required.ok && min.ok && kind.ok && repo.ok)) {
    return fail("unreachable");
  }
  return ok({
    delivery: { mode: mode.value, trunk: trunk.value, remote: remote.value },
    review: { requiredCleanRounds: required.value, minRounds: min.value },
    tracker:
      repo.value === undefined ? { kind: kind.value } : { kind: kind.value, repo: repo.value },
  });
}

function limits(
  root: Table,
): Result<Pick<DevsysConfig, "jev" | "verifier" | "cadence" | "eventModel">, ConfigError> {
  const j = section(root, "jev", ["timeout_ms", "confidence_floor"]);
  const v = section(root, "verifier", ["max_per_session"]);
  const c = section(root, "cadence", ["push_minutes"]);
  const e = section(root, "event_model", ["provider"]);
  if (!j.ok) return j;
  if (!v.ok) return v;
  if (!c.ok) return c;
  if (!e.ok) return e;
  const timeout = number(j.value, "jev", "timeout_ms", 4000, POSITIVE);
  const floor = number(j.value, "jev", "confidence_floor", 0.6, { min: 0, max: 1, integer: false });
  const max = number(v.value, "verifier", "max_per_session", 6, POSITIVE);
  const push = number(c.value, "cadence", "push_minutes", 60, POSITIVE);
  const provider = text(e.value, "event_model", "provider", "builtin");
  if (!timeout.ok) return timeout;
  if (!floor.ok) return floor;
  if (!max.ok) return max;
  if (!push.ok) return push;
  if (!provider.ok) return provider;
  return ok({
    jev: { timeoutMs: timeout.value, confidenceFloor: floor.value },
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
  if (!delivery.ok) return delivery;
  if (!lim.ok) return lim;
  if (!matrix.ok) return matrix;
  if (!routes.ok) return routes;
  if (!prof.ok) return prof;
  return ok({
    ...delivery.value,
    ...lim.value,
    profiles: { override: prof.value },
    models: matrix.value,
    routing: routes.value,
  });
}

const isMissingFile = (cause: unknown): boolean =>
  cause instanceof Error && "code" in cause && String(cause.code) === "ENOENT";

/** Reads `<repoRoot>/.development-system.toml`; a missing file means all defaults. */
export async function loadConfig(repoRoot: string): Promise<Result<DevsysConfig, ConfigError>> {
  let source: string;
  try {
    source = await readFile(join(repoRoot, CONFIG_FILE), "utf8");
  } catch (cause) {
    if (isMissingFile(cause)) return parseConfig("");
    return fail(
      `cannot read ${CONFIG_FILE}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  return parseConfig(source);
}
