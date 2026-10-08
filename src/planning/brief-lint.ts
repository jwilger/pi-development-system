/**
 * Brief lint (plan I9.5): a brief states the outcome, the people and the risks; endpoints, tables and
 * class names are solution detail that belongs in an ADR or the architecture. This is the
 * deterministic half (regex markers); the Jev half lives in `src/jev/questions/solution-detail.ts`.
 * Findings are warnings: a brief may legitimately quote a constraint that looks technical.
 */

type BriefFindingKind = "endpoint" | "table" | "class" | "path";

export type BriefFinding = {
  kind: BriefFindingKind;
  /** 1-based line in the brief. */
  line: number;
  /** The text that matched. */
  match: string;
  message: string;
};

type Rule = { kind: BriefFindingKind; pattern: RegExp; what: string };

const RULES: readonly Rule[] = [
  {
    kind: "endpoint",
    pattern: /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[\w\-/{}:.]+/g,
    what: "an HTTP endpoint",
  },
  {
    kind: "table",
    pattern: /\bCREATE\s+TABLE\b|`\w+`\s+table\b|\btable\s+`\w+`/gi,
    what: "a database table",
  },
  {
    kind: "class",
    pattern:
      /\b(?:(?:class|interface)\s+[A-Z]\w+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*(?:Service|Repository|Controller|Gateway|Manager|Handler|Factory|Client))\b/g,
    what: "a class or service name",
  },
  {
    kind: "path",
    pattern: /\b(?:src|lib|test|app|packages)\/[\w\-./]+\.\w+/g,
    what: "a source file path",
  },
];

const advice = (what: string): string =>
  `${what} is solution detail; keep the brief to outcome, users and risks and record this in an ADR (devsys_adr_new) or the architecture notes`;

/** The brief with fenced code blocks blanked, keeping line numbers: an example in a fence is quoted, not specified. */
function withoutFences(text: string): string[] {
  let inFence = false;
  return text.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
}

export function lintBrief(text: string): BriefFinding[] {
  return withoutFences(text).flatMap((line, i) =>
    RULES.flatMap((rule) =>
      [...line.matchAll(rule.pattern)].map((m) => ({
        kind: rule.kind,
        line: i + 1,
        match: m[0],
        message: advice(rule.what),
      })),
    ),
  );
}
