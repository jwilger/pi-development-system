import { type ParseError, parseError, type Sizing } from "./types.ts";

export const ARTIFACTS = [
  "task-record",
  "review",
  "adr-if-needed",
  "brief-lite",
  "brief",
  "decision-register",
  "journeys",
  "event-model",
  "architecture",
  "lens-review-optional",
  "lens-review",
] as const;

export type ArtifactId = (typeof ARTIFACTS)[number];

const SIZINGS: readonly Sizing[] = ["fix", "change", "capability", "product"];

/** The set the work needs by default; D4: proportional, and skipping any of it is a recorded departure. */
const BY_SIZING: Readonly<Record<Sizing, readonly ArtifactId[]>> = {
  fix: ["task-record"],
  change: ["task-record", "review", "adr-if-needed"],
  capability: [
    "task-record",
    "review",
    "adr-if-needed",
    "brief-lite",
    "journeys",
    "event-model",
    "lens-review-optional",
  ],
  product: [
    "task-record",
    "review",
    "adr-if-needed",
    "brief",
    "decision-register",
    "journeys",
    "event-model",
    "architecture",
    "lens-review",
  ],
};

export const recommendedArtifacts = (sizing: Sizing): readonly ArtifactId[] => BY_SIZING[sizing];

export const parseSizing = (value: string): Sizing | ParseError =>
  SIZINGS.find((s) => s === value) ??
  parseError(`unknown sizing "${value}": expected fix, change, capability or product`);
