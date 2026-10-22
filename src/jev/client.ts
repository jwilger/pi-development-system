import { createHash } from "node:crypto";
import type {
  ClassifierAnswer,
  ClassifierApi,
  ClassifierContext,
  ClassifierModel,
  ClassifierQuestion,
  ClassifierResult,
  JsonObject,
  Usage,
} from "@earendil-works/pi-ai";
import { err, ok, type Result } from "../core/result.ts";
import { splitModelRef } from "./models.ts";

export type JevAvailability = "online" | "offline" | "unknown";
export type JevError =
  | { kind: "no-model" }
  | { kind: "timeout" }
  | { kind: "provider"; message: string }
  | { kind: "usage-recording"; message: string }
  | { kind: "aborted" };

type Classifier = ClassifierModel<ClassifierApi>;

/** The slice of pi's `ctx.modelRegistry` that Jev needs; tests pass a fake. */
export interface ClassifierRegistry {
  findOfType(type: "classifier", provider: string, modelId: string): Classifier | undefined;
  hasConfiguredAuth(model: unknown): boolean;
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

export type JevAskOptions = {
  signal?: AbortSignal;
  /** Direct request usage only; cache hits and late results after cancellation emit nothing. */
  onUsage?: (usage: Usage) => void;
};

export interface Jev {
  ask(
    state: JsonObject,
    questions: Record<string, ClassifierQuestion>,
    options?: JevAskOptions,
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

const hashOf = (
  model: Classifier,
  state: JsonObject,
  questions: Record<string, ClassifierQuestion>,
): string =>
  createHash("sha256")
    .update(JSON.stringify({ provider: model.provider, model: model.id, state, questions }))
    .digest("hex");

/** Accounting belongs to this execution; its failure does not describe provider health. */
function reportUsage(usage: Usage | undefined, options?: JevAskOptions): Result<void, JevError> {
  try {
    if (usage !== undefined) options?.onUsage?.(usage);
    return ok(undefined);
  } catch (e) {
    return err({ kind: "usage-recording", message: e instanceof Error ? e.message : String(e) });
  }
}

/** Wraps the host classifier: model resolution, timeout, caching and typed errors. Never rejects. */
export function createJev(opts: JevOptions): Jev {
  let availability: JevAvailability = "unknown";
  let current: string | undefined;

  const run = async (
    model: Classifier,
    context: ClassifierContext,
    options?: JevAskOptions,
  ): Promise<Result<ClassifierResult, JevError>> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let cancelled: JevError | undefined;
    const cancellation = new Promise<JevError>((resolve) => {
      const cancel = (reason: JevError) => {
        if (cancelled !== undefined) return;
        cancelled = reason;
        // Settle before notifying the provider: synchronous abort responses must not win.
        resolve(reason);
        controller.abort();
      };
      onAbort = () => cancel({ kind: "aborted" });
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => cancel({ kind: "timeout" }), opts.timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        opts.registry.classify(model, context, { signal: controller.signal }),
        cancellation,
      ]);
      if ("kind" in outcome) return err(outcome);
      const reported = reportUsage(outcome.usage, options);
      if (!reported.ok) return reported;
      if (outcome.stopReason === "aborted") return err({ kind: "aborted" });
      if (outcome.stopReason === "error")
        return err({ kind: "provider", message: outcome.errorMessage ?? "classifier error" });
      return ok(outcome);
    } catch (e) {
      return err(
        cancelled ?? { kind: "provider", message: e instanceof Error ? e.message : String(e) },
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort !== undefined) options?.signal?.removeEventListener("abort", onAbort);
    }
  };

  return {
    async ask(state, questions, options) {
      if (options?.signal?.aborted) return err({ kind: "aborted" });
      const model = resolveJevModel(opts.registry, opts.candidates);
      if (model === undefined) {
        availability = "offline";
        current = undefined;
        return err({ kind: "no-model" });
      }
      current = `${model.provider}/${model.id}`;
      const key = hashOf(model, state, questions);
      const cached = opts.cache.get(key);
      if (cached !== undefined) return ok(cached.answers);
      const result = await run(model, { state, questions }, options);
      if (!result.ok) {
        if (result.error.kind !== "aborted" && result.error.kind !== "usage-recording") {
          availability = "offline";
        }
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
