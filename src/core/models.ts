import { err, ok, type Result } from "./result.ts";

/** Capability tiers and roles the system asks models for (plan Appendix B `[models]`). */
export const SLOTS = [
  "frontier",
  "strong",
  "fast",
  "planning",
  "advisor",
  "implementer",
  "reviewer",
  "lens",
  "researcher",
  "jev",
] as const;

export type Slot = (typeof SLOTS)[number];

export const isSlot = (value: string): value is Slot => SLOTS.some((s) => s === value);

/** `provider/id`; the id may contain `/` (gateway providers) and `*` (family pattern). */
export type ModelRef = `${string}/${string}`;

/** Ordered candidates per slot: `provider/id`, `provider/family-*`, or `@slot` indirection. */
export type ModelMatrix = Readonly<Record<Slot, readonly string[]>>;

export type Available = { readonly provider: string; readonly id: string };

export type ModelError =
  | { readonly kind: "unresolvable"; readonly slot: Slot }
  | { readonly kind: "cycle"; readonly path: readonly Slot[] };

export type Resolution = { readonly model: ModelRef; readonly via: string };

type VersionKey = { readonly numbers: readonly number[]; readonly date: number | undefined };

/** Date-like segments (YYYYMMDD) are snapshot suffixes, not versions. */
const MIN_DATE_DIGITS = 6;

function versionKey(id: string): VersionKey {
  const numbers: number[] = [];
  let date: number | undefined;
  for (const run of id.match(/\d+/g) ?? []) {
    if (run.length >= MIN_DATE_DIGITS) date = Number(run);
    else numbers.push(Number(run));
  }
  return { numbers, date };
}

function compareNumbers(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Natural version order over the numeric segments of two model ids. Dated snapshot suffixes rank
 * below the undated alias with the same version, so `x-4-5` beats `x-4-5-20251001`.
 */
export function compareModelVersions(a: string, b: string): number {
  const ka = versionKey(a);
  const kb = versionKey(b);
  const byNumbers = compareNumbers(ka.numbers, kb.numbers);
  if (byNumbers !== 0) return byNumbers;
  if (ka.date !== kb.date) {
    if (ka.date === undefined) return 1;
    if (kb.date === undefined) return -1;
    return ka.date < kb.date ? -1 : 1;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** `*`-only glob over a model id (no regular expressions built from configuration). */
function matchesPattern(pattern: string, id: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === id;
  const first = parts[0] ?? "";
  const last = parts.at(-1) ?? "";
  if (id.length < first.length + last.length || !id.startsWith(first) || !id.endsWith(last)) {
    return false;
  }
  let at = first.length;
  const limit = id.length - last.length;
  for (const middle of parts.slice(1, -1)) {
    const found = id.indexOf(middle, at);
    if (found === -1 || found + middle.length > limit) return false;
    at = found + middle.length;
  }
  return true;
}

function splitRef(candidate: string): { provider: string; id: string } | undefined {
  const slash = candidate.indexOf("/");
  if (slash <= 0 || slash === candidate.length - 1) return undefined;
  return { provider: candidate.slice(0, slash), id: candidate.slice(slash + 1) };
}

/** The exact model, or the newest available id matching the family pattern; `@slot` is not handled here. */
export function resolveCandidate(
  candidate: string,
  available: readonly Available[],
): ModelRef | undefined {
  const ref = splitRef(candidate);
  if (ref === undefined) return undefined;
  const matches = available
    .flatMap((m) => (m.provider === ref.provider && matchesPattern(ref.id, m.id) ? [m.id] : []))
    .sort(compareModelVersions);
  const best = matches.at(-1);
  return best === undefined ? undefined : `${ref.provider}/${best}`;
}

function resolveFrom(
  matrix: ModelMatrix,
  slot: Slot,
  available: readonly Available[],
  trail: readonly Slot[],
): Result<Resolution, ModelError> {
  if (trail.includes(slot)) return err({ kind: "cycle", path: [...trail, slot] });
  for (const candidate of matrix[slot]) {
    if (candidate.startsWith("@")) {
      const target = candidate.slice(1);
      if (!isSlot(target)) continue;
      const inner = resolveFrom(matrix, target, available, [...trail, slot]);
      if (inner.ok || inner.error.kind === "cycle") return inner;
      continue;
    }
    const model = resolveCandidate(candidate, available);
    if (model !== undefined) return ok({ model, via: candidate });
  }
  return err({ kind: "unresolvable", slot });
}

/** First candidate of the slot that resolves against what this machine can use; `via` is the matching candidate. */
export function resolveSlot(
  matrix: ModelMatrix,
  slot: Slot,
  available: readonly Available[],
): Result<Resolution, ModelError> {
  return resolveFrom(matrix, slot, available, []);
}

/** Shipped defaults: model families only (no dated ids), so they roll forward as providers ship. */
export function defaultMatrix(): ModelMatrix {
  return {
    frontier: [
      "openai-codex/gpt-*-astra",
      "openai/gpt-*-astra",
      "anthropic/claude-fable-*",
      "anthropic/claude-opus-*",
      "openai-codex/gpt-*-sol",
      "openai/gpt-*-sol",
    ],
    strong: [
      "openai-codex/gpt-*-sol",
      "openai/gpt-*-sol",
      "anthropic/claude-sonnet-*",
      "anthropic/claude-opus-*",
      "openai-codex/gpt-*-terra",
      "openai/gpt-*-terra",
    ],
    fast: [
      "openai-codex/gpt-*-luna",
      "openai/gpt-*-luna",
      "anthropic/claude-haiku-*",
      "openai-codex/gpt-*-terra",
      "openai/gpt-*-terra",
      "@strong",
    ],
    planning: ["@frontier"],
    advisor: ["@frontier"],
    implementer: ["@strong"],
    reviewer: [
      "anthropic/claude-opus-*",
      "anthropic/claude-sonnet-*",
      "openai-codex/gpt-*-sol",
      "openai/gpt-*-sol",
      "@strong",
    ],
    lens: ["@strong"],
    researcher: ["@fast"],
    jev: [
      "typesafe/jev-latest",
      "openrouter/typesafe/jev-latest",
      "opencode/jev-1.13",
      "cloudflare-workers-ai/typesafe/jev",
      "vercel-ai-gateway/typesafe-ai/jev",
    ],
  };
}

const WIDTH = Math.max(...SLOTS.map((s) => s.length));

/** The `[models]` TOML table for a matrix, one slot per line in declaration order. */
export function renderMatrixToml(matrix: ModelMatrix): string {
  const lines = SLOTS.map(
    (slot) => `${slot.padEnd(WIDTH)} = [${matrix[slot].map((c) => JSON.stringify(c)).join(", ")}]`,
  );
  return `[models]\n${lines.join("\n")}\n`;
}

/** `text` with its `[models]` table replaced by `matrix` (appended when absent); other tables untouched. */
export function upsertModelsTable(text: string, matrix: ModelMatrix): string {
  const table = renderMatrixToml(matrix);
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === "[models]");
  if (start === -1) {
    const body = text.trimEnd();
    return body === "" ? table : `${body}\n\n${table}`;
  }
  const nextHeader = lines.findIndex((l, i) => i > start && l.startsWith("["));
  const head = lines.slice(0, start).join("\n");
  const tail = nextHeader === -1 ? "" : lines.slice(nextHeader).join("\n");
  const before = head === "" ? "" : `${head}\n`;
  return tail === "" ? `${before}${table}` : `${before}${table}\n${tail}`;
}
