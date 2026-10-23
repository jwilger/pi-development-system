import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import {
  type Available,
  isSlot,
  type ModelMatrix,
  type Resolution,
  resolveSlot,
  SLOTS,
  type Slot,
  upsertModelsTable,
} from "../core/models.ts";
import {
  CONFIG_FILE,
  configErrorText,
  loadConfig,
  loadUserModels,
  USER_CONFIG_FILE,
  withUserModels,
} from "./config.ts";

const CONFIG_ENTRY_TYPE = "devsys-config";

export type CatalogModel = Available & {
  readonly cost?: { readonly input: number; readonly output: number };
};

/** The slice of pi's `ctx.modelRegistry` this command needs; tests pass a fake. */
export interface ModelCatalog {
  getAvailable(): readonly CatalogModel[];
  getModelsOfType(type: "classifier"): readonly CatalogModel[];
  hasConfiguredAuth(model: CatalogModel): boolean;
}

type SlotRow = {
  readonly slot: Slot;
  readonly resolution: Resolution | undefined;
};

/** Chat models with credentials plus classifier models with credentials: everything a slot may name. */
export function availableModels(catalog: ModelCatalog): CatalogModel[] {
  const classifiers = catalog
    .getModelsOfType("classifier")
    .filter((m) => catalog.hasConfiguredAuth(m));
  return [...catalog.getAvailable(), ...classifiers];
}

function resolveRows(matrix: ModelMatrix, available: readonly Available[]): SlotRow[] {
  return SLOTS.map((slot) => {
    const r = resolveSlot(matrix, slot, available);
    return { slot, resolution: r.ok ? r.value : undefined };
  });
}

const perMillion = (n: number): string => `$${Number(n.toFixed(2))}`;

function priceOf(model: string, available: readonly CatalogModel[]): string {
  const hit = available.find((m) => `${m.provider}/${m.id}` === model);
  return hit?.cost === undefined
    ? ""
    : ` · ${perMillion(hit.cost.input)}/${perMillion(hit.cost.output)} per M`;
}

/** ` · 32768-token window` (the same wording devsys_route_task uses) for a model whose window the registry knows, else nothing. */
function windowOf(model: string, available: readonly Available[]): string {
  const window = available.find((m) => `${m.provider}/${m.id}` === model)?.contextWindow;
  return window === undefined ? "" : ` · ${window}-token window`;
}

/** One line per slot: `slot → provider/id (via candidate) · $in/$out per M`, or `UNRESOLVED`. */
function renderModelsTable(rows: readonly SlotRow[], available: readonly CatalogModel[]): string {
  const width = Math.max(...SLOTS.map((s) => s.length));
  return rows
    .map(({ slot, resolution }) =>
      resolution === undefined
        ? `${slot.padEnd(width)}  → UNRESOLVED (no candidate matches a model with credentials)`
        : `${slot.padEnd(width)}  → ${resolution.model} (via ${resolution.via})${windowOf(resolution.model, available)}${priceOf(resolution.model, available)}`,
    )
    .join("\n");
}

const DEFAULT_FILE = 'version = 1\n\n[delivery]\nmode = "trunk"\n';

export type ModelsOutcome = {
  readonly ok: boolean;
  readonly written: boolean;
  readonly table: string;
};

type Choice = "accept" | "accept-rest" | "pick" | "pin";

/** Where a slot's current model comes from: the repo, the user config's own list, or an @slot into it. */
type SlotOrigin = "repo" | "user-own" | "user-ref";

type UserCandidates = Partial<Record<Slot, readonly string[]>>;

const CHOICE_LABELS: Record<Choice, string> = {
  accept: "accept",
  "accept-rest": "accept this and all remaining slots",
  pick: "pick another available model",
  pin: "pin the current exact id (no auto-roll)",
};

function offeredChoices(current: string | undefined, origin: SlotOrigin): readonly Choice[] {
  if (current === undefined) return ["pick"];
  if (origin === "user-ref") return ["accept", "accept-rest", "pick"];
  return ["accept", "accept-rest", "pick", "pin"];
}

/**
 * The user's own list for a slot shadows any repo edit, even when both pick the same model,
 * but only when that list resolves here; otherwise the repo's candidates are in charge. A slot
 * whose model differs from the repo's resolution reaches the user config through an @slot.
 */
function slotOrigin(
  slot: Slot,
  row: SlotRow,
  matrix: ModelMatrix,
  local: UserCandidates,
  available: readonly Available[],
): SlotOrigin {
  if (row.resolution === undefined) return "repo";
  const own = local[slot];
  const merged = withUserModels(matrix, local);
  const ownResolves =
    own !== undefined &&
    resolveRows({ ...merged, [slot]: own }, available).find((r) => r.slot === slot)?.resolution !==
      undefined;
  if (ownResolves) return "user-own";
  const repoModel = resolveRows(matrix, available).find((r) => r.slot === slot)?.resolution;
  return row.resolution.model !== repoModel?.model ? "user-ref" : "repo";
}

async function chooseSlot(
  ctx: ExtensionCommandContext,
  slot: Slot,
  row: SlotRow,
  available: readonly CatalogModel[],
  matrix: ModelMatrix,
  origin: SlotOrigin,
): Promise<{ matrix: ModelMatrix; acceptRest: boolean }> {
  const current = row.resolution?.model;
  // A slot the user config names keeps its model there: pinning would commit it and a pick
  // would be shadowed by it, so only accepting is offered. A slot that reaches a user model
  // through an @slot can still pick (a pick goes ahead of the reference), but not pin.
  if (origin === "user-own") {
    const picked = await ctx.ui.select(
      `${slot}: ${current} (from the user config ${USER_CONFIG_FILE}; change it there)`,
      [CHOICE_LABELS.accept, CHOICE_LABELS["accept-rest"]],
    );
    return { matrix, acceptRest: picked === CHOICE_LABELS["accept-rest"] };
  }
  const offered = offeredChoices(current, origin);
  const labels = offered.map((c) => CHOICE_LABELS[c]);
  const title =
    origin === "user-ref"
      ? `${slot}: ${current} (through the user config ${USER_CONFIG_FILE})`
      : `${slot}: ${current ?? "unresolved"}`;
  const picked = await ctx.ui.select(title, labels);
  const choice = offered.find((k) => CHOICE_LABELS[k] === picked);
  if (choice === "accept-rest") return { matrix, acceptRest: true };
  if (choice === "pin" && current !== undefined) {
    return { matrix: { ...matrix, [slot]: [current, ...matrix[slot]] }, acceptRest: false };
  }
  if (choice === "pick") {
    const refs = available.map((m) => `${m.provider}/${m.id}`);
    const model = await ctx.ui.select(`${slot}: choose a model`, refs);
    if (model !== undefined) {
      return { matrix: { ...matrix, [slot]: [model, ...matrix[slot]] }, acceptRest: false };
    }
  }
  return { matrix, acceptRest: false };
}

async function readConfigText(repoRoot: string): Promise<string> {
  try {
    return await readFile(join(repoRoot, CONFIG_FILE), "utf8");
  } catch {
    return DEFAULT_FILE;
  }
}

/** Core of `/devsys-models`: resolve, optionally adjust interactively, and write the `[models]` table. */
export async function runModelsCommand(
  pi: Pick<ExtensionAPI, "appendEntry">,
  ctx: ExtensionCommandContext,
  args: string,
  catalog: ModelCatalog,
): Promise<ModelsOutcome> {
  // Edit and write only the repo's matrix; user-config candidates are shown, never committed.
  const config = await loadConfig(ctx.cwd, { userDir: null });
  const user = config.ok ? await loadUserModels(getAgentDir()) : config;
  if (!user.ok) {
    ctx.ui.notify(configErrorText(user.error), "error");
    return { ok: false, written: false, table: "" };
  }
  if (!config.ok) return { ok: false, written: false, table: "" };
  const local = user.value;
  const available = availableModels(catalog);
  let matrix = config.value.models;
  let rows = resolveRows(withUserModels(matrix, local), available);
  const check = args.split(/\s+/).includes("--check");
  if (!check && ctx.hasUI) {
    let acceptRest = false;
    for (const slot of SLOTS) {
      if (acceptRest) break;
      const row = rows.find((r) => r.slot === slot);
      if (row === undefined) continue;
      const origin = slotOrigin(slot, row, matrix, local, available);
      const next = await chooseSlot(ctx, slot, row, available, matrix, origin);
      matrix = next.matrix;
      acceptRest = next.acceptRest;
      rows = resolveRows(withUserModels(matrix, local), available);
    }
  }
  const table = renderModelsTable(rows, available);
  const unresolved = rows.flatMap((r) => (r.resolution === undefined ? [r.slot] : []));
  if (check || unresolved.length > 0) {
    const ok = unresolved.length === 0;
    ctx.ui.notify(
      ok ? table : `${table}\n\nUnresolvable slots: ${unresolved.join(", ")}. Nothing written.`,
      ok ? "info" : "error",
    );
    return { ok, written: false, table };
  }
  const text = upsertModelsTable(await readConfigText(ctx.cwd), matrix);
  await writeFile(join(ctx.cwd, CONFIG_FILE), text);
  pi.appendEntry(CONFIG_ENTRY_TYPE, { models: matrix });
  ctx.ui.notify(`${table}\n\nWrote [models] to ${CONFIG_FILE}.`, "info");
  return { ok: true, written: true, table };
}

export function registerModelsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("devsys-models", {
    description:
      "Resolve the per-project model matrix against the models you can use and write it to .development-system.toml (--check: report only)",
    handler: async (args, ctx) => {
      await runModelsCommand(pi, ctx, args, ctx.modelRegistry);
    },
  });
}

const Parameters = Type.Object({
  slot: Type.Optional(
    Type.String({ description: `One of: ${SLOTS.join(", ")}. Omit for every slot.` }),
  ),
});

const text = (t: string, isError = false) => ({
  content: [{ type: "text" as const, text: t }],
  details: undefined,
  isError,
});

/** `devsys_models`: the resolved model for a slot (or all slots), from the project's matrix. */
export function createModelsTool(): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_models",
    label: "Resolve models",
    description:
      "Return the model this project's matrix resolves each slot to (frontier, strong, fast, planning, advisor, implementer, reviewer, lens, researcher, jev) given the credentials on this machine.",
    promptSnippet: "Look up which model a development-system slot resolves to",
    parameters: Parameters,
    exposure: "codemode",
    async execute(
      _id,
      params: Static<typeof Parameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      if (params.slot !== undefined && !isSlot(params.slot)) {
        return text(`unknown slot "${params.slot}". Slots: ${SLOTS.join(", ")}`, true);
      }
      const config = await loadConfig(ctx.cwd);
      if (!config.ok) return text(configErrorText(config.error), true);
      const available = availableModels(ctx.modelRegistry);
      const rows = resolveRows(config.value.models, available).filter(
        (r) => params.slot === undefined || r.slot === params.slot,
      );
      return text(
        rows
          .map((r) =>
            r.resolution === undefined
              ? `${r.slot}: unresolved`
              : `${r.slot}: ${r.resolution.model} (via ${r.resolution.via})${windowOf(r.resolution.model, available)}`,
          )
          .join("\n"),
        rows.some((r) => r.resolution === undefined),
      );
    },
  };
}
