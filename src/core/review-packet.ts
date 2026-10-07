import { type Finding, SEVERITIES, type Severity } from "./review.ts";
import { isParseError, type ParseError, parseError } from "./types.ts";

export type ReviewPacket = {
  readonly slice: string;
  readonly round: number;
  readonly lenses: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<string>;
  readonly findings: ReadonlyArray<Finding>;
  readonly verdict: "no-blocking" | "blocking";
};

const HEADER = /^##\s+Review\s+[—–-]\s+(.+?)\s+[—–-]\s+round\s+(\S+)\s+[—–-]\s+lenses:\s*(.*)$/m;
// Reviewers add text after the location (`fn`, a second location); the first backticked one is the finding's.
const FINDING = /^-\s*\[([^\]]+)\]\s+(\S+)\s+(?:`([^`]+)`[^—–]*?\s+)?[—–-]\s+(.+)$/;
// An indented line under a finding is its detail (trigger, fix), unless it is itself a finding.
const isDetail = (line: string): boolean =>
  /^\s+/.test(line) && !/^\s*(?:[-*+]|\d+[.)])\s*\[/.test(line);

// `until` ends a section; by default any heading does. Findings ends only at a known section so a stray
// heading inside it (### Nits) makes its lines errors instead of silently cutting the findings off.
const section = (text: string, name: string, until = /^###?\s/m): string | undefined => {
  const wanted = name.toLowerCase();
  const match = [...text.matchAll(/^###\s+(.+?)\s*$/gim)].find(
    (m) => m[1]?.toLowerCase() === wanted,
  );
  if (match === undefined) return undefined;
  const rest = text.slice(match.index + match[0].length);
  const next = until.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
};
const AFTER_FINDINGS = /^###?\s+(?:Verdict|Sources inspected|Not verified)\b/im;

const isSeverity = (value: string): value is Severity =>
  (SEVERITIES as readonly string[]).includes(value);

const locate = (target: string | undefined): { path?: string; line?: number } => {
  if (target === undefined) return {};
  const m = /^(.*?):(\d+)(?:-\d+)?$/.exec(target);
  return m === null ? { path: target } : { path: m[1] ?? target, line: Number(m[2]) };
};

function parseFinding(line: string, lens: string[], index: number): Finding | ParseError {
  const m = FINDING.exec(line);
  if (m === null) {
    return parseError(
      `unparseable finding "${line}": expected "- [severity] <lens> \`path:line\` — <summary> — <why>"`,
    );
  }
  const severity = m[1] ?? "";
  if (!isSeverity(severity)) {
    return parseError(
      `unknown severity "${severity}": use blocking, should-fix, nit or false-positive`,
    );
  }
  const findingLens = m[2] ?? "";
  if (!lens.includes(findingLens)) lens.push(findingLens);
  return {
    id: `${findingLens}-${index}`,
    severity,
    ...locate(m[3]),
    summary: (m[4] ?? "").trim(),
    lens: findingLens,
  };
}

const FINDINGS_MISSING =
  'missing "### Findings" section: write "- none" under it when there are no findings';
const NO_FINDINGS = /^(?:-\s*)?[([]?(?:none|no findings?)[)\]]?\.?$/i;

/** The packet's verdict word, or the parse error explaining what is wrong with it. */
function verdictOf(text: string): "blocking" | "no-blocking" | ParseError {
  const word = section(text, "Verdict")?.trim().split(/\s+/)[0]?.toLowerCase();
  if (word === "no-blocking" || word === "blocking") return word;
  return parseError(
    'missing or invalid verdict: end the packet with "### Verdict" then no-blocking or blocking',
  );
}

/** Every finding line of the Findings section; a line that is not a finding is an error, never dropped. */
function findingsOf(text: string, lenses: string[]): Finding[] | ParseError {
  const body = section(text, "Findings", AFTER_FINDINGS);
  if (body === undefined) return parseError(FINDINGS_MISSING);
  const lines = body
    .split("\n")
    .flatMap((l) => (isDetail(l) ? [] : [l.trim()]))
    .filter((l) => l !== "" && !NO_FINDINGS.test(l));
  const findings: Finding[] = [];
  for (const [i, line] of lines.entries()) {
    const finding = parseFinding(line, lenses, i + 1);
    if (isParseError(finding)) return finding;
    findings.push(finding);
  }
  return findings;
}

const isBlocking = (f: Finding): boolean =>
  f.severity === "blocking" || f.severity === "should-fix";

const listOf = (text: string): string[] =>
  text
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l !== "");

/** Parse the reviewer packet of plan Appendix A. Strict about structure, tolerant of dash style. */
export function parseReviewPacket(text: string): ReviewPacket | ParseError {
  const header = HEADER.exec(text);
  if (header === null) {
    return parseError('missing packet header "## Review — <slice> — round <n> — lenses: <a, b>"');
  }
  const round = Number(header[2]);
  if (!Number.isInteger(round) || round < 1) {
    return parseError(`round "${header[2]}" is not a positive integer`);
  }
  const lenses = listOf(header[3] ?? "");
  const verdict = verdictOf(text);
  if (isParseError(verdict)) return verdict;
  const findings = findingsOf(text, lenses);
  if (isParseError(findings)) return findings;
  if (findings.some(isBlocking) !== (verdict === "blocking")) {
    return parseError(
      `verdict "${verdict}" contradicts the findings: blocking/should-fix findings mean "blocking", otherwise "no-blocking"`,
    );
  }
  const sources = (section(text, "Sources inspected") ?? "")
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l !== "");
  return { slice: (header[1] ?? "").trim(), round, lenses, sources, findings, verdict };
}
