const FIX_CI = /^fix\(ci\): /;
const REVERT = /^Revert "/;
const OVERRIDE = /^Jev-Override:[ \t]*(\S.*)$/im;
const REVERTS = /This reverts commit ([0-9a-f]{7,40})/gi;

export function subjectOf(message: string): string {
  return message.split("\n", 1)[0] ?? "";
}

/** True for commits allowed while the build is broken. */
export function isBuildFix(message: string): boolean {
  const subject = subjectOf(message);
  return FIX_CI.test(subject) || REVERT.test(subject);
}

/** Reason given in a `Jev-Override: <reason>` trailer, if any. */
export function overrideReason(message: string): string | null {
  return OVERRIDE.exec(message)?.[1]?.trim() ?? null;
}

/** SHAs (possibly abbreviated) that this commit message says it reverts. */
export function revertedShas(message: string): string[] {
  return [...message.matchAll(REVERTS)].map((m) => (m[1] ?? "").toLowerCase());
}

/** Strip git's comment lines (as the commit-msg hook receives them). */
export function cleanMessage(raw: string): string {
  return raw
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
}
