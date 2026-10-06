import { appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Departure, renderDepartureMarkdown } from "../core/departure.ts";

const exists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Appends a departure to `docs/decisions/YYYY-MM.md` (UTC month of `now`), creating it with a header. */
export async function appendDecision(
  repoRoot: string,
  d: Departure,
  now: Date,
): Promise<{ path: string }> {
  const month = now.toISOString().slice(0, 7);
  const dir = join(repoRoot, "docs", "decisions");
  const path = join(dir, `${month}.md`);
  await mkdir(dir, { recursive: true });
  const entry = renderDepartureMarkdown(d);
  if (await exists(path)) {
    await appendFile(path, `\n${entry}`);
  } else {
    await appendFile(path, `# Decisions — ${month}\n\n${entry}`);
  }
  return { path };
}
