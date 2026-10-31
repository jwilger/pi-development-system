export interface ArchitectureSnapshot {
  readonly architecture: string | undefined;
  /** Repository-relative paths and exact UTF-8 contents. The template is not a decision. */
  readonly decisions: ReadonlyMap<string, string>;
}

export interface ArchitectureChange {
  readonly before: ArchitectureSnapshot;
  readonly after: ArchitectureSnapshot;
  /** Records already merged at the authoritative trunk boundary, not earlier pending commits. */
  readonly mergedPaths: ReadonlySet<string>;
  /** All historical decision paths reachable from that boundary, including removed records. */
  readonly historicalPaths: ReadonlySet<string>;
}

export interface ArchitectureDelivery {
  readonly trunk: ArchitectureSnapshot;
  /** Complete pending snapshots in parent-before-child order; the Git adapter must establish completeness. */
  readonly pending: readonly ArchitectureSnapshot[];
  /** Actual intended resulting commits, not an aggregate diff substituted for a range. */
  readonly resulting: readonly ArchitectureSnapshot[];
  readonly historicalPaths: ReadonlySet<string>;
}

export function checkArchitectureDelivery(
  delivery: ArchitectureDelivery,
): readonly ArchitectureViolation[] {
  const source = delivery.pending.at(-1) ?? delivery.trunk;
  const result = delivery.resulting.at(-1) ?? delivery.trunk;
  const paths = new Set([...source.decisions.keys(), ...result.decisions.keys()]);
  if (
    source.architecture !== result.architecture ||
    [...paths].some((path) => source.decisions.get(path) !== result.decisions.get(path))
  ) {
    return [
      {
        kind: "delivery-content-mismatch",
        path: "ARCHITECTURE.md",
        message:
          "Resulting delivery must preserve the full pending architecture and decision contents, including replacement records.",
      },
    ];
  }
  const mergedPaths = new Set(delivery.trunk.decisions.keys());
  for (const snapshots of [delivery.pending, delivery.resulting]) {
    let before = delivery.trunk;
    for (const after of snapshots) {
      const violations = checkArchitectureChange({
        before,
        after,
        mergedPaths,
        historicalPaths: delivery.historicalPaths,
      });
      if (violations.length > 0) return violations;
      before = after;
    }
  }
  return [];
}

export interface ArchitectureViolation {
  readonly kind: string;
  readonly path: string;
  readonly message: string;
}

// A changed word is only a candidate substantive change, never proof of correspondence.
const words = (text: string | undefined): string =>
  text
    ?.normalize("NFC")
    .match(/[\p{L}\p{N}]+/gu)
    ?.join(" ") ?? "";

function statusOnlySupersession(
  before: string,
  after: string | undefined,
  replacement: string | undefined,
): boolean {
  if (after === undefined || replacement === undefined) return false;
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const indexes = oldLines.flatMap((line, position) =>
    /^- \*\*Status:\*\* (?!superseded\b).+$/i.test(line) ? [position] : [],
  );
  if (indexes.length !== 1 || oldLines.length !== newLines.length) return false;
  const index = indexes[0];
  const number = replacement.match(/^docs\/adr\/(\d{4})-.+\.md$/)?.[1];
  if (index === undefined || number === undefined) return false;
  const expected = `- **Status:** superseded by [ADR ${number}](${replacement.slice("docs/adr/".length)})`;
  return (
    newLines[index] === expected &&
    oldLines.every((line, position) => position === index || newLines[position] === line)
  );
}

/** Structural detection only. An empty result is not independent semantic approval. */
export function checkArchitectureChange(
  change: ArchitectureChange,
): readonly ArchitectureViolation[] {
  const added = [...change.after.decisions.keys()].filter(
    (path) => !change.before.decisions.has(path),
  );
  if (added.length > 1) {
    return [
      {
        kind: "multiple-new-adrs",
        path: "docs/adr",
        message: "A resulting commit may add only one ADR; use separate delivery units.",
      },
    ];
  }
  const identity = (path: string) => path.match(/^docs\/adr\/(\d{4})-.+\.md$/)?.[1];
  for (const path of added) {
    if (
      [...change.historicalPaths].some(
        (historical) =>
          historical === path ||
          (identity(path) !== undefined && identity(historical) === identity(path)),
      )
    ) {
      return [
        {
          kind: "adr-reintroduced",
          path,
          message:
            "This historical decision identity cannot be reintroduced or renamed; use a new decision number.",
        },
      ];
    }
  }
  const changed = new Set([...change.before.decisions.keys(), ...change.after.decisions.keys()]);
  const decisionsChanged = [...changed].some(
    (path) => change.before.decisions.get(path) !== change.after.decisions.get(path),
  );
  if (
    decisionsChanged &&
    (words(change.after.architecture) === "" ||
      words(change.before.architecture) === words(change.after.architecture))
  ) {
    return [
      {
        kind: "architecture-update-required",
        path: "ARCHITECTURE.md",
        message:
          "A decision change requires a corresponding substantive architecture update in this commit.",
      },
    ];
  }
  for (const path of changed) {
    const before = change.before.decisions.get(path);
    const after = change.after.decisions.get(path);
    if (before === undefined || before === after) continue;
    if (
      (change.mergedPaths.has(path) || added.length > 0) &&
      !statusOnlySupersession(before, after, added[0])
    ) {
      return [
        {
          kind: "adr-history-conflict",
          path,
          message:
            "Preserve this record exactly except status-only supersession linked to the single newly added replacement.",
        },
      ];
    }
  }
  for (const [path, content] of change.after.decisions) {
    const target = content.match(
      /^- \*\*Status:\*\* superseded by \[ADR \d{4}\]\((\d{4}-[^/\n)]+\.md)\)$/m,
    )?.[1];
    if (
      target !== undefined &&
      !change.after.decisions.has(`docs/adr/${target}`) &&
      (change.before.decisions.has(`docs/adr/${target}`) ||
        change.before.decisions.get(path) !== content)
    ) {
      return [
        {
          kind: "adr-replacement-missing",
          path,
          message:
            "A superseded decision must retain its referenced replacement in every source and resulting delivery commit.",
        },
      ];
    }
  }
  if (words(change.after.architecture) === "") {
    return [
      {
        kind: "architecture-required",
        path: "ARCHITECTURE.md",
        message: "The adopted project requires a self-contained root architecture document.",
      },
    ];
  }
  if (/\]\([^\n)]*(?:^|[/.])adr\/[^\n)]*\)/im.test(change.after.architecture ?? "")) {
    return [
      {
        kind: "architecture-history-backlink",
        path: "ARCHITECTURE.md",
        message:
          "Current architecture must not backlink to ADR history; keep requirements self-contained.",
      },
    ];
  }
  return [];
}
