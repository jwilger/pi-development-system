import type { Finding, Severity } from "./review.ts";
import type { ReviewPacket } from "./review-packet.ts";

/** A reviewer's result as it arrives from the typed submit tool (see ADR 0006). */
export type Submission = {
  readonly slice: string;
  readonly round: number;
  readonly lenses: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<string>;
  readonly findings: ReadonlyArray<{
    readonly lens: string;
    readonly severity: Severity;
    readonly path?: string | undefined;
    readonly line?: number | undefined;
    readonly summary: string;
  }>;
  readonly verdict: "no-blocking" | "blocking";
};

/** Why a submission was refused: a stable kebab-case id and a message the reviewer can act on. */
export type SubmitError = {
  readonly id: "verdict-contradicts-findings" | "finding-lens-not-listed";
  readonly message: string;
};

const counts = (f: { severity: Severity }): boolean =>
  f.severity === "blocking" || f.severity === "should-fix";

/** The packet a submission stands for, or the refusal. The schema has already checked its shape. */
export function packetFromSubmission(input: Submission): ReviewPacket | SubmitError {
  const unlisted = input.findings.find((f) => !input.lenses.includes(f.lens));
  if (unlisted !== undefined) {
    return {
      id: "finding-lens-not-listed",
      message: `a finding names lens "${unlisted.lens}" but the packet's lenses are ${input.lenses.join(", ")}; list every lens you used in \`lenses\``,
    };
  }
  if (input.findings.some(counts) !== (input.verdict === "blocking")) {
    return {
      id: "verdict-contradicts-findings",
      message: `verdict "${input.verdict}" contradicts the findings: blocking/should-fix findings mean "blocking", otherwise "no-blocking"`,
    };
  }
  const findings: Finding[] = input.findings.map((f, i) => ({
    id: `${f.lens}-${i + 1}`,
    severity: f.severity,
    ...(f.path === undefined ? {} : { path: f.path }),
    ...(f.line === undefined ? {} : { line: f.line }),
    summary: f.summary,
    lens: f.lens,
  }));
  return {
    slice: input.slice,
    round: input.round,
    lenses: input.lenses,
    sources: input.sources,
    findings,
    verdict: input.verdict,
  };
}
