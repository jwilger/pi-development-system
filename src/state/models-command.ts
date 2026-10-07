import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
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
import { CONFIG_FILE, loadConfig } from "./config.ts";

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

/** One line per slot: `slot → provider/id (via candidate) · $in/$out per M`, or `UNRESOLVED`. */
function renderModelsTable(rows: readonly SlotRow[], available: readonly CatalogModel[]): string {
  const width = Math.max(...SLOTS.map((s) => s.length));
  return rows
    .map(({ slot, resolution }) =>
      resolution === undefined
        ? `${slot.padEnd(width)}  → UNRESOLVED (no candidate matches a model with credentials)`
        : `${slot.padEnd(width)}  → ${resolution.model} (via ${resolution.via})${priceOf(resolution.model, available)}`,
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

const CHOICE_LABELS: Record<Choice, string> = {
  accept: "accept",
  "accept-rest": "accept this and all remaining slots",
  pick: "pick another available model",
  pin: "pin the current exact id (no auto-roll)",
};

async function chooseSlot(
  ctx: ExtensionCommandContext,
  slot: Slot,
  row: SlotRow,
  available: readonly CatalogModel[],
  matrix: ModelMatrix,
): Promise<{ matrix: ModelMatrix; acceptRest: boolean }> {
  const current = row.resolution?.model;
  const labels = current === undefined ? [CHOICE_LABELS.pick] : Object.values(CHOICE_LABELS);
  const picked = await ctx.ui.select(`${slot}: ${current ?? "unresolved"}`, labels);
  const choice = (Object.keys(CHOICE_LABELS) as Choice[]).find((k) => CHOICE_LABELS[k] === picked);
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
  const config = await loadConfig(ctx.cwd);
  if (!config.ok) {
    ctx.ui.notify(`${CONFIG_FILE}: ${config.error.message}`, "error");
    return { ok: false, written: false, table: "" };
  }
  const available = availableModels(catalog);
  let matrix = config.value.models;
  let rows = resolveRows(matrix, available);
  const check = args.split(/\s+/).includes("--check");
  if (!check && ctx.hasUI) {
    let acceptRest = false;
    for (const slot of SLOTS) {
      if (acceptRest) break;
      const row = rows.find((r) => r.slot === slot);
      if (row === undefined) continue;
      const next = await chooseSlot(ctx, slot, row, available, matrix);
      matrix = next.matrix;
      acceptRest = next.acceptRest;
      rows = resolveRows(matrix, available);
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
    exposure: "direct",
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
      if (!config.ok) return text(`${CONFIG_FILE}: ${config.error.message}`, true);
      const available = availableModels(ctx.modelRegistry);
      const rows = resolveRows(config.value.models, available).filter(
        (r) => params.slot === undefined || r.slot === params.slot,
      );
      return text(
        rows
          .map((r) =>
            r.resolution === undefined
              ? `${r.slot}: unresolved`
              : `${r.slot}: ${r.resolution.model} (via ${r.resolution.via})`,
          )
          .join("\n"),
        rows.some((r) => r.resolution === undefined),
      );
    },
  };
}
