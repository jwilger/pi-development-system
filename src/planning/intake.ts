import { ARTIFACTS, type ArtifactId, recommendedArtifacts } from "../core/sizing.ts";
import type { Phase, Sizing } from "../core/types.ts";

const SLUG_MAX = 40;
/** Jev need at or above this offers an artifact the sizing table did not list. */
const CONSIDER_AT = 0.5;

export const sliceSlug = (request: string): string => {
  const slug = request
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  return slug === "" ? "work" : slug;
};

export type ArtifactProposal = {
  readonly recommended: readonly ArtifactId[];
  readonly consider: readonly ArtifactId[];
};

export const proposeArtifacts = (
  sizing: Sizing,
  artifactNeed: Readonly<Partial<Record<ArtifactId, number>>>,
): ArtifactProposal => {
  const recommended = recommendedArtifacts(sizing);
  const consider = ARTIFACTS.filter(
    (id) => !recommended.includes(id) && (artifactNeed[id] ?? 0) >= CONSIDER_AT,
  );
  return { recommended, consider };
};

/** Small work starts building; bigger work plans first (D4: proportional). */
export const phaseFor = (sizing: Sizing): Phase =>
  sizing === "fix" || sizing === "change" ? "implementing" : "planning";

export const renderProposal = (input: {
  sizing: Sizing;
  basis: string;
  proposal: ArtifactProposal;
}): string => {
  const { sizing, basis, proposal } = input;
  const lines = [
    `Proposed sizing: ${sizing}. ${basis}`,
    `Recommended artifacts: ${proposal.recommended.join(", ")}.`,
  ];
  if (proposal.consider.length > 0) lines.push(`Also consider: ${proposal.consider.join(", ")}.`);
  lines.push(
    "Skipping a recommended artifact is allowed but recorded: call devsys_record_departure with gate artifact.skipped:<artifact>.",
    "The event model and architecture are never blocked by a gate; they are recommended, not enforced.",
  );
  return lines.join("\n");
};
