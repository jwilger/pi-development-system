import { type ParseError, parseError } from "./types.ts";

/** Thinking levels pi accepts; kept equal to the vendored runtime's list by a test. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Per-spawn choices the coordinator makes; they beat agent-type preferences and inheritance. */
export type SpawnOverrides = {
  readonly model?: string;
  readonly thinkingLevel?: ThinkingLevel;
};

export type Settings = {
  readonly provider: string | undefined;
  readonly id: string | undefined;
  readonly thinkingLevel: ThinkingLevel;
};

const MODEL_REF = /^[^\s/*]+\/[^\s*]+$/;

const isLevel = (value: unknown): value is ThinkingLevel =>
  THINKING_LEVELS.some((level) => level === value);

/** Parses the optional `model`/`thinkingLevel` of an `agent_spawn` call; undefined when neither is given. */
export function parseSpawnOverrides(input: {
  readonly model?: unknown;
  readonly thinkingLevel?: unknown;
}): SpawnOverrides | undefined | ParseError {
  const { model, thinkingLevel } = input;
  if (model !== undefined && (typeof model !== "string" || !MODEL_REF.test(model))) {
    return parseError(`model must be "provider/model-id", got ${JSON.stringify(model)}`);
  }
  if (thinkingLevel !== undefined && !isLevel(thinkingLevel)) {
    return parseError(`thinkingLevel must be one of: ${THINKING_LEVELS.join(", ")}`);
  }
  if (model === undefined && thinkingLevel === undefined) return undefined;
  return {
    ...(model === undefined ? {} : { model }),
    ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
  };
}

/** Overrides win; the provider is everything before the first slash, the model id the rest. */
export function applySpawnOverrides(
  base: Settings,
  overrides: SpawnOverrides | undefined,
): Settings {
  if (overrides === undefined) return base;
  const at = overrides.model?.indexOf("/") ?? -1;
  const model =
    overrides.model === undefined || at < 0
      ? {}
      : { provider: overrides.model.slice(0, at), id: overrides.model.slice(at + 1) };
  return {
    ...base,
    ...model,
    ...(overrides.thinkingLevel === undefined ? {} : { thinkingLevel: overrides.thinkingLevel }),
  };
}

export type ModelSource = "current" | "preferences" | "restored" | "inherited";

/**
 * Where a subagent's starting model comes from. A per-spawn pin disqualifies the type's
 * preference list (the pin itself is applied afterwards for fresh spawns), so a resumed pinned
 * thread keeps the model it was already running instead of falling back to the preferences.
 */
export function modelSource(input: {
  mode: "use-current" | "pick-first-scoped" | "pick-first-available";
  pinned: boolean;
  hasPreferences: boolean;
  hasRestored: boolean;
}): ModelSource {
  if (input.mode === "use-current") return "current";
  if (!input.pinned && input.hasPreferences) return "preferences";
  return input.hasRestored ? "restored" : "inherited";
}
