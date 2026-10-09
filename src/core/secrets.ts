/**
 * Credentials in a pending commit (non-negotiable 7). Unlike `redactSecrets`, which scrubs anything that
 * might be a secret from text that is only displayed, this stops a commit, so it reports only formats
 * that are unmistakable: false alarms cost a hard-stop dialog, and a pushed secret cannot be taken back.
 */

type Pattern = { label: string; pattern: RegExp };

const TOKEN_PATTERNS: readonly Pattern[] = [
  { label: "a private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    label: "a GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/,
  },
  { label: "an AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "an API key (sk-)", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: "a live Stripe key", pattern: /\b[sr]k_live_[A-Za-z0-9]{16,}/ },
  { label: "a Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}/ },
  { label: "a Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{20,}/ },
  { label: "a GitLab token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { label: "an npm token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  {
    label: "a JSON web token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    label: "a password inside a URL",
    // `scheme://user:password@host`, where the password is not an obvious placeholder.
    pattern: /\b\w+:\/\/[^\s/@:]+:((?![^@\s]*[<>*{}$[\]])[^\s/@]{8,})@/,
  },
  {
    label: "a secret assigned a literal value",
    pattern:
      /\b\w*(?:secret|token|password|passwd|api_?key|private_?key)\w*["']?\s*[:=]\s*["']([A-Za-z0-9+/_-]{20,})["']/i,
  },
];

/** Files that hold credentials by convention. */
const SECRET_FILE =
  /(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$|dist$)[\w.-]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|p12|pfx)|\.netrc|\.pgpass)$/;

/** A line of a diff that adds content (not the `+++` file header). */
const isAddedLine = (line: string): boolean => line.startsWith("+") && !line.startsWith("+++");

const RANDOM_ONLY = new Set(["a password inside a URL", "a secret assigned a literal value"]);

const hasLetterAndDigit = (text: string): boolean => /[A-Za-z]/.test(text) && /\d/.test(text);

/** The kinds of credential in a piece of text (a subagent's task, say); kinds only, never values. */
export function credentialKinds(text: string): string[] {
  return [...new Set(text.split("\n").flatMap(labelsIn))];
}

/** Labels what a line of added text contains; a credential-looking assignment must also look random. */
function labelsIn(text: string): string[] {
  const labels: string[] = [];
  for (const { label, pattern } of TOKEN_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit === null) continue;
    // A credential must look random: `postgres:postgres@localhost` is a placeholder, not a password.
    if (RANDOM_ONLY.has(label) && !hasLetterAndDigit(hit[1] ?? hit[0])) continue;
    labels.push(label);
  }
  return labels;
}

export type PendingFile = {
  path: string;
  added: readonly string[];
  /** The commit removes the file, so its name is no finding. */
  deleted?: boolean;
};

/** Splits a unified diff into the added lines of each file. */
export function filesOfDiff(diff: string): PendingFile[] {
  const files: { path: string; added: string[]; deleted: boolean }[] = [];
  for (const line of diff.split("\n")) {
    const header = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(line);
    if (header !== null) {
      files.push({ path: header[2] ?? "", added: [], deleted: false });
    } else if (line.startsWith("deleted file mode")) {
      const last = files.at(-1);
      if (last !== undefined) last.deleted = true;
    } else if (isAddedLine(line)) {
      files.at(-1)?.added.push(line.slice(1));
    }
  }
  return files;
}

/**
 * One sentence per finding, naming the file and the kind of credential and never its value.
 * Only content a commit would add is read; a removed secret is not a finding.
 */
export function findSecrets(files: readonly PendingFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (file.deleted !== true && SECRET_FILE.test(file.path))
      found.push(`${file.path} is a file that holds credentials`);
    const labels = new Set(file.added.flatMap(labelsIn));
    for (const label of labels) found.push(`${file.path} contains ${label}`);
  }
  return found;
}
