import { type ParseError, type Profile, parseError } from "./types.ts";

export type { Profile };

const PROFILES: readonly Profile[] = ["rust", "typescript"];

/** Files whose presence marks a repo as using a language profile. */
export const MARKERS: ReadonlyArray<{ profile: Profile; files: readonly string[] }> = [
  { profile: "rust", files: ["Cargo.toml"] },
  { profile: "typescript", files: ["package.json", "tsconfig.json"] },
];

const isProfile = (value: string): value is Profile => PROFILES.some((p) => p === value);

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
