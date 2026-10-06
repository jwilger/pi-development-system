import { err, ok, type Result } from "./result.ts";
import { type ParseError, parseError } from "./types.ts";

type Trailer = { readonly key: string; readonly value: string };

export type ParsedCommit = {
  readonly type: string;
  readonly scope: string | undefined;
  readonly breaking: boolean;
  readonly subject: string;
  readonly body: string;
  readonly trailers: readonly Trailer[];
};

const SUBJECT = /^([a-z]+)(?:\(([^()\s][^()]*)\))?(!)?: (\S.*)$/;
const TRAILER = /^([A-Za-z][A-Za-z-]*|BREAKING CHANGE)(?:: | #)(.*)$/;

const withoutComments = (message: string): string =>
  message
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();

const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");

const trailerBlock = (parts: readonly string[]): Trailer[] | undefined => {
  const last = parts.at(-1);
  if (last === undefined) return undefined;
  const lines = last.split("\n");
  const parsed = lines.map((line) => TRAILER.exec(line));
  if (parsed.some((m) => m === null)) return undefined;
  return parsed.flatMap((m) =>
    m === null ? [] : [{ key: m[1] ?? "", value: (m[2] ?? "").trim() }],
  );
};

/** Splits a message into subject, body paragraphs and the trailing trailer block. */
function split(message: string): { subject: string; body: string[]; trailers: Trailer[] } {
  const parts = paragraphs(withoutComments(message));
  const subject = parts[0] ?? "";
  const rest = parts.slice(1);
  const trailers = trailerBlock(rest);
  return {
    subject,
    body: trailers === undefined ? rest : rest.slice(0, -1),
    trailers: trailers ?? [],
  };
}

export function parseConventionalCommit(message: string): Result<ParsedCommit, ParseError> {
  const { subject, body, trailers } = split(message);
  const m = SUBJECT.exec(subject.split("\n")[0] ?? "");
  if (m === null) {
    return err(
      parseError(
        `"${subject.split("\n")[0] ?? ""}" is not a Conventional Commit subject: type(scope)!: subject`,
      ),
    );
  }
  return ok({
    type: m[1] ?? "",
    scope: m[2],
    breaking: m[3] === "!" || trailers.some((t) => t.key === "BREAKING CHANGE"),
    subject: m[4] ?? "",
    body: body.join("\n\n"),
    trailers,
  });
}

const FORBIDDEN_KEYS = ["co-authored-by", "generated-by"];
const AI_NAMES = /\b(ai|claude|copilot|codex|gpt|chatgpt|openai|anthropic|gemini|llm)\b/i;
const GENERATED_BANNER = /generated with/i;

/** Lines of the message that carry an AI attribution trailer (non-negotiable 8). */
export function findForbiddenTrailers(
  message: string,
  extraKeys: readonly string[] = [],
): string[] {
  const keys = [...FORBIDDEN_KEYS, ...extraKeys.map((k) => k.toLowerCase())];
  return withoutComments(message)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      const key = /^([A-Za-z][A-Za-z-]*)\s*[:=]/.exec(trimmed)?.[1]?.toLowerCase();
      if (key !== undefined && keys.includes(key)) return true;
      if (key === "signed-off-by") return AI_NAMES.test(trimmed);
      return GENERATED_BANNER.test(trimmed) && AI_NAMES.test(trimmed);
    });
}

const AI_TRAILER_ANYWHERE =
  /(?:co-authored-by|generated-by)\s*[:=]|signed-off-by\s*[:=][^\n]*\b(?:ai|claude|copilot|codex|gpt|chatgpt|openai|anthropic|gemini|llm)\b/gi;

/** AI-attribution trailer keys anywhere in free text (command lines, quoted strings, printf bodies). */
export function findForbiddenTrailerKeys(text: string): string[] {
  return [...text.matchAll(AI_TRAILER_ANYWHERE)].map((m) => m[0].trim());
}

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w !== "").length;
const SHORT_BULLET_WORDS = 5;

/** A list of file names or other terse items; bullets that explain themselves are prose. */
const isTerseList = (paragraph: string): boolean =>
  paragraph
    .split("\n")
    .every((line) => BULLET.test(line) && wordCount(line.replace(BULLET, "")) < SHORT_BULLET_WORDS);

const PROSE_TRAILER_WORDS = 5;

/** A trailer-shaped line whose value is a sentence ("Reason: the cache was stale…") is prose. */
const isProseTrailer = (line: string): boolean => {
  const m = TRAILER.exec(line.trim());
  return m !== null && m[1] !== "BREAKING CHANGE" && wordCount(m[2] ?? "") >= PROSE_TRAILER_WORDS;
};

/** A body needs at least one prose paragraph (not a file list) that says more than a few words. */
export function hasRationaleBody(message: string): boolean {
  const { body, trailers } = split(message);
  const trailerBlockLines =
    withoutComments(message)
      .split(/\n\s*\n/)
      .at(-1)
      ?.split("\n") ?? [];
  const proseTrailer = trailers.length > 0 && trailerBlockLines.some(isProseTrailer);
  return (
    proseTrailer || body.some((paragraph) => !isTerseList(paragraph) && wordCount(paragraph) >= 5)
  );
}
