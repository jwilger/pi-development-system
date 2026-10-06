/** Default Jev classifier candidates, tried in order; overridable by `[models] jev`. */
export const DEFAULT_JEV_CANDIDATES: readonly string[] = [
  "typesafe/jev-latest",
  "openrouter/typesafe/jev-latest",
  "opencode/jev-1.13",
  "cloudflare-workers-ai/typesafe/jev",
  "vercel-ai-gateway/typesafe-ai/jev",
];

/** Splits `provider/id` on the first slash (ids may themselves contain slashes). */
export function splitModelRef(ref: string): { provider: string; id: string } | undefined {
  const at = ref.indexOf("/");
  if (at <= 0 || at === ref.length - 1) return undefined;
  return { provider: ref.slice(0, at), id: ref.slice(at + 1) };
}
