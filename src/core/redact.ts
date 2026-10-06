/** Removes credentials from text before it is written to committed logs or session entries (R11). */
export function redactSecrets(text: string): string {
  return text
    .replace(/(\w+:\/\/)[^\s/@]+@/g, "$1[redacted]@")
    .replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]");
}
