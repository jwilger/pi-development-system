import { err, ok, type Result } from "../core/result.ts";
import { type ParseError, parseError } from "../core/types.ts";

/** `0004-prompt-cache-safe-channels.md` → 4. The template is `0000` and the README has no number. */
const NUMBERED = /^(\d{4})-.+\.md$/;

/** One more than the highest ADR number present; gaps are not filled, so a number is never reused. */
export function nextAdrNumber(fileNames: readonly string[]): number {
  const numbers = fileNames.flatMap((name) => {
    const digits = NUMBERED.exec(name)?.[1];
    return digits === undefined ? [] : [Number.parseInt(digits, 10)];
  });
  return Math.max(0, ...numbers) + 1;
}

export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A one-line title with something to slug from; a line break could add lines to the document. */
export function parseAdrTitle(input: string): Result<string, ParseError> {
  const title = input.trim();
  if (/[\r\n]/.test(title)) return err(parseError("an ADR title is a single line"));
  if (slugify(title) === "") {
    return err(parseError("an ADR title needs at least one letter or digit"));
  }
  return ok(title);
}

const adrNumberText = (n: number): string => String(n).padStart(4, "0");

export const adrFileName = (n: number, title: string): string =>
  `${adrNumberText(n)}-${slugify(title)}.md`;

export type AdrInput = { number: number; title: string; date: string };

/** The template with its heading, status and date filled in; the sections are left for the author. */
export function renderAdr(template: string, input: AdrInput): string {
  // Function replacers: a title is data, so `$&` and `$1` in it must not act as replacement patterns.
  return template
    .replace(/^# ADR NNNN: .*$/m, () => `# ADR ${adrNumberText(input.number)}: ${input.title}`)
    .replace(/^- \*\*Status:\*\* .*$/m, () => "- **Status:** proposed")
    .replace(/^- \*\*Date:\*\* .*$/m, () => `- **Date:** ${input.date}`);
}
