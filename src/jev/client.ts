import { createHash } from "node:crypto";
import type {
  ClassifierAnswer,
  ClassifierApi,
  ClassifierContext,
  ClassifierModel,
  ClassifierQuestion,
  ClassifierResult,
  JsonObject,
} from "@earendil-works/pi-ai";
import { err, ok, type Result } from "../core/result.ts";
import { splitModelRef } from "./models.ts";

export type JevAvailability = "online" | "offline" | "unknown";
export type JevError =
  | { kind: "no-model" }
  | { kind: "timeout" }
  | { kind: "provider"; message: string }
  | { kind: "aborted" };

type Classifier = ClassifierModel<ClassifierApi>;

/** The slice of pi's `ctx.modelRegistry` that Jev needs; tests pass a fake. */
export interface ClassifierRegistry {
  findOfType(type: "classifier", provider: string, modelId: string): Classifier | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: structural bridge to the host's Model<Api> parameter
  hasConfiguredAuth(model: any): boolean;
  classify(
    model: Classifier,
    context: ClassifierContext,
    options?: { signal?: AbortSignal },
  ): Promise<ClassifierResult>;
}

export type JevOptions = {
  registry: ClassifierRegistry;
  candidates: readonly string[];
  timeoutMs: number;
  cache: Map<string, ClassifierResult>;
  now(): number;
};

export interface Jev {
  ask(
    state: JsonObject,
    questions: Record<string, ClassifierQuestion>,
  ): Promise<Result<Record<string, ClassifierAnswer>, JevError>>;
  availability(): JevAvailability;
  model(): string | undefined;
}

/** First candidate `provider/id` that exists in the registry AND has configured auth. */
export function resolveJevModel(
  registry: ClassifierRegistry,
  candidates: readonly string[],
): Classifier | undefined {
  for (const ref of candidates) {
    const parts = splitModelRef(ref);
    if (parts === undefined) continue;
    const model = registry.findOfType("classifier", parts.provider, parts.id);
    if (model !== undefined && registry.hasConfiguredAuth(model)) return model;
  }
  return undefined;
}

const hashOf = (state: JsonObject, questions: Record<string, ClassifierQuestion>): string =>
  createHash("sha256").update(JSON.stringify({ state, questions })).digest("hex");

/** Wraps the host classifier: model resolution, timeout, caching and typed errors. Never rejects. */
export function createJev(opts: JevOptions): Jev {
  let availability: JevAvailability = "unknown";
  let current: string | undefined;

  const run = async (
    model: Classifier,
    context: ClassifierContext,
  ): Promise<Result<ClassifierResult, JevError>> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, opts.timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        opts.registry.classify(model, context, { signal: controller.signal }),
        timeout,
      ]);
      if (outcome === "timeout") return err({ kind: "timeout" });
      if (outcome.stopReason === "aborted") return err({ kind: "aborted" });
      if (outcome.stopReason === "error")
        return err({ kind: "provider", message: outcome.errorMessage ?? "classifier error" });
      return ok(outcome);
    } catch (e) {
      return err({ kind: "provider", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  return {
    async ask(state, questions) {
      const model = resolveJevModel(opts.registry, opts.candidates);
      if (model === undefined) {
        availability = "offline";
        current = undefined;
        return err({ kind: "no-model" });
      }
      current = `${model.provider}/${model.id}`;
      const key = hashOf(state, questions);
      const cached = opts.cache.get(key);
      if (cached !== undefined) return ok(cached.answers);
      const result = await run(model, { state, questions });
      if (!result.ok) {
        availability = result.error.kind === "aborted" ? availability : "offline";
        return result;
      }
      availability = "online";
      opts.cache.set(key, result.value);
      return ok(result.value.answers);
    },
    availability: () => availability,
    model: () => current,
  };
}
