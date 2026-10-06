import { access } from "node:fs/promises";
import { join } from "node:path";
import { isParseError, type ParseError, type Profile, parseError } from "./types.ts";

export type { Profile };

export const PROFILES: readonly Profile[] = ["rust", "typescript"];

const MARKERS: ReadonlyArray<{ profile: Profile; files: readonly string[] }> = [
  { profile: "rust", files: ["Cargo.toml"] },
  { profile: "typescript", files: ["package.json", "tsconfig.json"] },
];

export const isProfile = (value: string): value is Profile => PROFILES.some((p) => p === value);

/** Boundary parse for configured profile names. */
export function parseProfiles(names: readonly string[]): Profile[] | ParseError {
  const out: Profile[] = [];
  for (const name of names) {
    if (!isProfile(name)) {
      return parseError(`unknown profile "${name}": expected one of ${PROFILES.join(", ")}`);
    }
    out.push(name);
  }
  return out;
}

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
