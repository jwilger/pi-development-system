/** Tunables for the release gates. */

export const WORKFLOW_FILE = "publish.yml";
export const MAIN_BRANCH = "main";

/** How many first-parent commits to walk back looking for a green build. */
export const MAX_HISTORY_WALK = 100;

/** Minimum probability that a `fix(ci)` diff relates to the failing build. */
export const MIN_FIX_RELATED = 0.8;

/** Minimum Choice confidence required to trust Jev's semver judgment. */
export const MIN_BUMP_CONFIDENCE = 0.6;

/** Truncation limits for text sent to Jev. */
export const MAX_DIFF_CHARS = 60_000;
export const MAX_LOG_CHARS = 12_000;

/** Paths whose changes alter the published npm package. */
export const PUBLISHED_PATHS = [
  "extensions/",
  "skills/",
  "prompts/",
  "themes/",
  "README.md",
  "package.json",
];
