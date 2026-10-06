import type { ClassifierResult } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type ClassifierRegistry,
  createJev,
  type Jev,
  type JevAvailability,
  resolveJevModel,
} from "./client.ts";
import { DEFAULT_JEV_CANDIDATES } from "./models.ts";

export type JevHolder = {
  /** The Jev bound to this context's model registry (one per registry, shared cache). */
  forContext(ctx: Pick<ExtensionContext, "modelRegistry">): Jev;
  /** Cheap, offline probe of whether a Jev credential is configured. */
  probe(ctx: Pick<ExtensionContext, "modelRegistry">): {
    availability: JevAvailability;
    model: string | undefined;
  };
};

export function createJevHolder(opts?: {
  candidates?: readonly string[];
  timeoutMs?: number;
  now?: () => number;
}): JevHolder {
  const candidates = opts?.candidates ?? DEFAULT_JEV_CANDIDATES;
  const cache = new Map<string, ClassifierResult>();
  const bound = new WeakMap<object, Jev>();
  const registryOf = (ctx: Pick<ExtensionContext, "modelRegistry">): ClassifierRegistry =>
    ctx.modelRegistry;
  return {
    forContext(ctx) {
      const registry = registryOf(ctx);
      const existing = bound.get(registry);
      if (existing !== undefined) return existing;
      const jev = createJev({
        registry,
        candidates,
        timeoutMs: opts?.timeoutMs ?? 15_000,
        cache,
        now: opts?.now ?? Date.now,
      });
      bound.set(registry, jev);
      return jev;
    },
    probe(ctx) {
      const model = resolveJevModel(registryOf(ctx), candidates);
      return model === undefined
        ? { availability: "offline", model: undefined }
        : { availability: "online", model: `${model.provider}/${model.id}` };
    },
  };
}
