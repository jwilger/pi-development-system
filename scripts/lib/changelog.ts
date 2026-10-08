/** Pure parts of the changelog generator: grouping commits into releases and rendering them. */

export type Commit = { readonly sha: string; readonly subject: string; readonly date: string };

/** A commit that changed `package.json`'s version; the release it ends. */
export type Bump = { readonly sha: string; readonly version: string };

export type Release = {
  readonly version: string;
  readonly date?: string;
  readonly commits: readonly Commit[];
};

type Parsed = {
  readonly type: string;
  readonly scope?: string;
  readonly breaking: boolean;
  readonly text: string;
};

const SUBJECT = /^([a-z]+)(?:\(([^)]+)\))?(!)?: (.+)$/;

export function parseSubject(subject: string): Parsed | undefined {
  const match = SUBJECT.exec(subject);
  const type = match?.[1];
  const text = match?.[4];
  if (type === undefined || text === undefined) return undefined;
  const scope = match?.[2];
  return {
    type,
    ...(scope === undefined ? {} : { scope }),
    breaking: match?.[3] === "!",
    text,
  };
}

/**
 * `commits` oldest first. A commit belongs to the first bump at or after it (the release it went
 * out in); commits after the last bump are `Unreleased`. Newest release first.
 */
export function groupReleases(commits: readonly Commit[], bumps: readonly Bump[]): Release[] {
  const bumpAt = new Map(bumps.map((b) => [b.sha, b.version]));
  const releases: Release[] = [];
  let pending: Commit[] = [];
  for (const commit of commits) {
    pending.push(commit);
    const version = bumpAt.get(commit.sha);
    if (version !== undefined) {
      releases.unshift({ version, date: commit.date, commits: pending });
      pending = [];
    }
  }
  if (pending.length > 0) releases.unshift({ version: "Unreleased", commits: pending });
  return releases;
}

const SECTIONS = ["Breaking changes", "Features", "Fixes", "Other"] as const;
type Section = (typeof SECTIONS)[number];

const sectionOf = (parsed: Parsed | undefined): Section => {
  if (parsed?.breaking === true) return "Breaking changes";
  if (parsed?.type === "feat") return "Features";
  if (parsed?.type === "fix") return "Fixes";
  return "Other";
};

const escapeMarkdown = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]])/g, "\\$1");

const entry = (commit: Commit): string => {
  const parsed = parseSubject(commit.subject);
  const text = escapeMarkdown(parsed?.text ?? commit.subject);
  const scope = parsed?.scope === undefined ? "" : `**${escapeMarkdown(parsed.scope)}:** `;
  return `  - ${scope}${text} (\`${commit.sha.slice(0, 7)}\`)`;
};

function renderRelease(release: Release): string[] {
  const heading =
    release.date === undefined ? release.version : `${release.version} - ${release.date}`;
  const lines = [`## ${heading}`, ""];
  for (const section of SECTIONS) {
    const entries = release.commits
      .filter((c) => sectionOf(parseSubject(c.subject)) === section)
      .map(entry);
    if (entries.length > 0) lines.push(`- **${section}**`, ...entries);
  }
  return [...lines, ""];
}

/** The whole CHANGELOG.md, ending in one newline. */
export function renderChangelog(releases: readonly Release[]): string {
  const header = [
    "# Changelog",
    "",
    "Generated from the Conventional Commit history by `npm run changelog`, after the release commit; do not edit by hand.",
    "",
  ];
  return `${[...header, ...releases.flatMap(renderRelease)].join("\n").trimEnd()}\n`;
}
