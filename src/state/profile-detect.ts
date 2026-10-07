import { access } from "node:fs/promises";
import { join } from "node:path";
import { MARKERS, parseProfiles } from "../core/profile.ts";
import { isParseError, type Profile } from "../core/types.ts";

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/** Profiles that apply to `repoRoot`; a non-empty `override` (valid names only) replaces detection. */
export async function detectProfiles(
  repoRoot: string,
  override: readonly string[] = [],
): Promise<Profile[]> {
  if (override.length > 0) {
    const parsed = parseProfiles(override);
    if (!isParseError(parsed)) return parsed;
  }
  const found: Profile[] = [];
  for (const { profile, files } of MARKERS) {
    const hits = await Promise.all(files.map((f) => exists(join(repoRoot, f))));
    if (hits.some(Boolean)) found.push(profile);
  }
  return found;
}
