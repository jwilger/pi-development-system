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

const SEP = "[—–-]";
const HEADER = new RegExp(
  `^##\\s+Review\\s+${SEP}\\s+(.+?)\\s+${SEP}\\s+round\\s+(\\S+)\\s+${SEP}\\s+lenses:\\s*(.*)$`,
  "m",
);
const FINDING = /^-\s*\[([^\]]+)\]\s+(\S+)\s+(?:`([^`]+)`\s+)?[—–-]\s+(.+)$/;

const section = (text: string, name: string): string | undefined => {
  const match = new RegExp(`^###\\s+${name}\\s*$`, "im").exec(text);
  if (match === null) return undefined;
  const rest = text.slice(match.index + match[0].length);
  const next = /^###?\s/m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
};

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
  const lenses = (header[3] ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const verdictText = section(text, "Verdict")?.trim().split(/\s+/)[0]?.toLowerCase();
  if (verdictText !== "no-blocking" && verdictText !== "blocking") {
    return parseError(
      'missing or invalid verdict: end the packet with "### Verdict" then no-blocking or blocking',
    );
  }
  const findings: Finding[] = [];
  const lines = (section(text, "Findings") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^-?\s*none\.?$/i.test(l));
  for (const [i, line] of lines.entries()) {
    const finding = parseFinding(line, lenses, i + 1);
    if (isParseError(finding)) return finding;
    findings.push(finding);
  }
  const hasBlocking = findings.some(
    (f) => f.severity === "blocking" || f.severity === "should-fix",
  );
  if (hasBlocking !== (verdictText === "blocking")) {
    return parseError(
      `verdict "${verdictText}" contradicts the findings: blocking/should-fix findings mean "blocking", otherwise "no-blocking"`,
    );
  }
  const sources = (section(text, "Sources inspected") ?? "")
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l !== "");
  return {
    slice: (header[1] ?? "").trim(),
    round,
    lenses,
    sources,
    findings,
    verdict: verdictText,
  };
}
