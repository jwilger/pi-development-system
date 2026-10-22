/**
 * Whether a subagent request fits a model's context window (ADR 0009). Pure; constants, not configuration.
 */

/** Tokens a subagent spends before any work: system prompt, skills and tool schemas (measured 6–11K). */
const SUBAGENT_OVERHEAD_TOKENS = 8000;

/** Share of the window a request may use; quality degrades from about ½–⅔ of the served window. */
export const FIT_RATIO = 0.6;

const CHARS_PER_TOKEN = 4;

/** Coarse token estimate for a subagent request: overhead, the task text and the files it names. */
export function estimateRequestTokens(input: {
  readonly taskChars: number;
  readonly fileBytes: number;
}): number {
  return (
    SUBAGENT_OVERHEAD_TOKENS +
    Math.ceil(input.taskChars / CHARS_PER_TOKEN) +
    Math.ceil(input.fileBytes / CHARS_PER_TOKEN)
  );
}

/** A model whose window is unknown always fits; a known window fits up to FIT_RATIO of it. */
export function fitsWindow(estimate: number, contextWindow: number | undefined): boolean {
  return contextWindow === undefined || estimate <= contextWindow * FIT_RATIO;
}
