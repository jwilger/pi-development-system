/**
 * Writes CHANGELOG.md from the commit history: one section per version, found from the commits
 * that changed `package.json`'s version.
 *
 *   npm run changelog
 */
import { writeFileSync } from "node:fs";
import { type Bump, type Commit, groupReleases, renderChangelog } from "./lib/changelog.ts";
import { git, out } from "./lib/sh.ts";

const FIELD = "\u001f";

const commits: Commit[] = git("log", "--reverse", `--format=%H${FIELD}%cs${FIELD}%s`)
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    const [sha, date, ...subject] = line.split(FIELD);
    return sha === undefined || date === undefined
      ? []
      : [{ sha, date, subject: subject.join(FIELD) }];
  });

const versionAt = (sha: string): string | undefined => {
  try {
    const manifest: unknown = JSON.parse(git("show", `${sha}:package.json`));
    return typeof manifest === "object" && manifest !== null && "version" in manifest
      ? String(manifest.version)
      : undefined;
  } catch {
    return undefined;
  }
};

const bumps: Bump[] = [];
let last: string | undefined;
for (const sha of git("log", "--reverse", "--format=%H", "--", "package.json").split("\n")) {
  const version = sha === "" ? undefined : versionAt(sha);
  if (version !== undefined && version !== last) bumps.push({ sha, version });
  last = version ?? last;
}

writeFileSync("CHANGELOG.md", renderChangelog(groupReleases(commits, bumps)));
out(`CHANGELOG.md: ${commits.length} commits, ${bumps.length} releases`);
