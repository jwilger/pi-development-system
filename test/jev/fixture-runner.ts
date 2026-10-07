import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ClassifierQuestion } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createJev, type Jev } from "../../src/jev/client.ts";
import { DEFAULT_JEV_CANDIDATES } from "../../src/jev/models.ts";

export type FixtureCase = { state: Record<string, string>; expected: string };
export type Fixture = { questionHash: string; cases: FixtureCase[] };

export const questionHash = (question: ClassifierQuestion): string =>
  createHash("sha256").update(JSON.stringify(question)).digest("hex").slice(0, 16);

export const loadFixture = (name: string): Fixture =>
  JSON.parse(
    readFileSync(new URL(`../../evals/jev/${name}.json`, import.meta.url), "utf8"),
  ) as Fixture;

/** A real Jev over the user's pi credentials, outside any pi session (see evals/jev/README.md). */
export async function realJev(): Promise<Jev> {
  const registry = new ModelRegistry(await ModelRuntime.create());
  return createJev({
    registry,
    candidates: DEFAULT_JEV_CANDIDATES,
    timeoutMs: 30_000,
    cache: new Map(),
    now: Date.now,
  });
}
