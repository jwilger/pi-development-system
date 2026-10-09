import { type ArtifactId, recommendedArtifacts } from "../core/sizing.ts";
import type { Sizing } from "../core/types.ts";

/**
 * Where each planning artifact lives, as paths relative to the repository: a file, or a directory
 * (ending in `/`) that holds at least one file. Artifacts that are not documents (the task record,
 * the review flow, an ADR when one is needed, the optional lens review) have no entry.
 */
const LOCATIONS: Readonly<Partial<Record<ArtifactId, readonly string[]>>> = {
  "brief-lite": ["docs/product/brief.md"],
  brief: ["docs/product/brief.md"],
  "decision-register": ["docs/product/decisions.md"],
  journeys: ["docs/product/journeys.md"],
  "event-model": ["docs/event-model/"],
  architecture: ["docs/architecture.md", "ARCHITECTURE.md"],
  "lens-review": ["docs/product/reviews/"],
};

/** What the filesystem and the open departures say; the shell supplies these. */
export type ArtifactEvidence = {
  /** True for a file that exists, or a directory (path ends in `/`) that holds a file. */
  readonly exists: (path: string) => boolean;
  /** Gate ids of the open departures, qualifier included. */
  readonly departedGates: readonly string[];
};

/** Where an artifact is looked for, for a message that says what to write and where. */
export const locationsOf = (id: ArtifactId): readonly string[] => LOCATIONS[id] ?? [];

/** The recommended planning artifacts for this size that have neither a file nor a recorded skip. */
export function missingArtifacts(sizing: Sizing, evidence: ArtifactEvidence): ArtifactId[] {
  return recommendedArtifacts(sizing).filter((id) => {
    const places = LOCATIONS[id];
    if (places === undefined) return false;
    if (places.some((p) => evidence.exists(p))) return false;
    return !evidence.departedGates.includes(`artifact.skipped:${id}`);
  });
}
