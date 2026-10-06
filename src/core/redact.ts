/** Removes credentials from text before it is written to committed logs or session entries (R11). */
export function redactSecrets(text: string): string {
  return text
    .replace(/(\w+:\/\/)[^\s/@]+@/g, "$1[redacted]@")
    .replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}/g, "[redacted]")
    .replace(/\b(\w*(?:TOKEN|KEY|SECRET|PASSWORD)\w*)=("[^"]*"|'[^']*'|\S+)/gi, "$1=[redacted]")
    .replace(/\b(Authorization:\s*)\w+\s+[^\s'"]+/gi, "$1[redacted]")
    .replace(/\bBearer\s+[^\s'"]+/g, "Bearer [redacted]")
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
      "[redacted private key]",
    )
    .replace(
      /\b(\w*(?:token|key|secret|password|passwd)\w*["']?\s*(?::=|[:=])\s*)(["'])[^"'\n]+\2/gi,
      "$1$2[redacted]$2",
    )
    .replace(
      /\b(\w*(?:token|key|secret|password|passwd|passphrase|pwd)\w*\s*(?::=|[:=])[ \t]*)[^\s"'`,;]{4,}/gi,
      "$1[redacted]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
    .replace(/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g, "[redacted]")
    .replace(/\bAIza[0-9A-Za-z_-]{35}/g, "[redacted]")
    .replace(/(\s-u\s+[^\s:]+:)\S+/g, "$1[redacted]")
    .replace(/\b(Cookie:\s*)[^\n]+/gi, "$1[redacted]")
    .replace(/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted]")
    .replace(/\bglpat-[A-Za-z0-9_-]{16,}/g, "[redacted]")
    .replace(/\bnpm_[A-Za-z0-9]{30,}/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[redacted]");
}
