import { splitLines } from "./git-intent.ts";
import { opaqueMentions, resolveGit } from "./git-invocations.ts";
import { stripHeredocs } from "./heredoc.ts";

export type CommitExtraction =
  | { readonly kind: "not-commit" }
  | { readonly kind: "message"; readonly message: string }
  | { readonly kind: "file"; readonly path: string }
  | {
      readonly kind: "unknown";
      readonly trailers: readonly string[];
      /** A `-m` value is a substitution or variable: the message exists but cannot be read. */
      readonly opaqueMessage: boolean;
    };

type Options = {
  messages: string[];
  trailers: string[];
  file: string | undefined;
  opaque: boolean;
  /** Heredoc markers found inside opaque `-m` values (`$(cat <<EOF …)`). */
  markers: number[];
};

type Parsed = {
  readonly kind: "message" | "file" | "trailer";
  readonly value: string | undefined;
  /** Index of the next argument to read. */
  readonly next: number;
};

/** Option, kind and the shortest prefix git still resolves uniquely (`--fi` would be `--fixup`). */
const LONG: ReadonlyArray<readonly [string, Parsed["kind"], number]> = [
  ["--message", "message", 4],
  ["--file", "file", 5],
  ["--trailer", "trailer", 4],
];

/** The option a `--name`/`--na=value` spelling means; git accepts any unambiguous prefix (3+ chars). */
function longOption(arg: string): { kind: Parsed["kind"]; inline: string | undefined } | undefined {
  if (!arg.startsWith("--")) return undefined;
  const eq = arg.indexOf("=");
  const name = eq < 0 ? arg : arg.slice(0, eq);
  const hit = LONG.find(([long, , min]) => name.length >= min && long.startsWith(name));
  if (hit === undefined) return undefined;
  return { kind: hit[1], inline: eq < 0 ? undefined : arg.slice(eq + 1) };
}

/** Reads the message/file/trailer option starting at args[i], in any of its spellings. */
function parseArg(args: readonly string[], i: number): Parsed | undefined {
  const a = args[i] ?? "";
  const long = longOption(a);
  if (long !== undefined) {
    return long.inline === undefined
      ? { kind: long.kind, value: args[i + 1], next: i + 2 }
      : { kind: long.kind, value: long.inline, next: i + 1 };
  }
  if (a === "-F") return { kind: "file", value: args[i + 1], next: i + 2 };
  if (/^-F./.test(a)) return { kind: "file", value: a.slice(2), next: i + 1 };
  if (/^-[A-Za-z]*m$/.test(a)) return { kind: "message", value: args[i + 1], next: i + 2 };
  if (/^-[A-Za-z]*m./.test(a)) {
    return { kind: "message", value: a.slice(a.indexOf("m") + 1), next: i + 1 };
  }
  return undefined;
}

/** A value that is itself a substitution or variable (not prose that mentions backticks). */
const OPAQUE_VALUE = /^\s*(?:\$\(|`)|^\$\{?\w+\}?$/;

function record(options: Options, parsed: Parsed): void {
  if (parsed.kind === "file") options.file = parsed.value;
  else if (parsed.kind === "trailer") options.trailers.push(parsed.value ?? "");
  else if (parsed.value === undefined || OPAQUE_VALUE.test(parsed.value)) {
    options.opaque = true;
    for (const hit of (parsed.value ?? "").matchAll(/#HD(\d+)/g))
      options.markers.push(Number(hit[1]));
  } else options.messages.push(parsed.value);
}

function readOptions(args: readonly string[]): Options {
  const options: Options = {
    messages: [],
    trailers: [],
    file: undefined,
    opaque: false,
    markers: [],
  };
  for (let i = 0; i < args.length; ) {
    const parsed = parseArg(args, i);
    if (parsed !== undefined) record(options, parsed);
    i = parsed?.next ?? i + 1;
  }
  return options;
}

const unknown = (trailers: readonly string[] = [], opaqueMessage = false): CommitExtraction => ({
  kind: "unknown",
  trailers,
  opaqueMessage,
});

const STDIN_PATHS = new Set(["-", "/dev/stdin", "/proc/self/fd/0"]);
const MARKER = /#HD(\d+)/g;

/** Body of the first heredoc opened on this line or later (its stdin, or the `$(cat <<EOF)` message). */
const heredocFrom = (lines: readonly string[], line: number, bodies: readonly string[]) => {
  for (const text of lines.slice(line)) {
    const hit = [...text.matchAll(MARKER)][0];
    if (hit !== undefined) return bodies[Number(hit[1])];
  }
  return undefined;
};

function extractOne(
  args: readonly string[],
  heredoc: string | undefined,
  bodies: readonly string[],
): CommitExtraction {
  const options = readOptions(args);
  if (options.file !== undefined && STDIN_PATHS.has(options.file)) {
    return heredoc === undefined
      ? { kind: "file", path: "-" }
      : { kind: "message", message: heredoc };
  }
  if (options.file !== undefined) return { kind: "file", path: options.file };
  const parts = [...options.messages];
  if (options.opaque) {
    // The value's own heredoc, not whichever heredoc opens first on a shared line.
    const own = options.markers.flatMap((i) => bodies[i] ?? []);
    const fallback = heredoc === undefined ? [] : [heredoc];
    const bodiesOfValue = own.length > 0 ? own : fallback;
    if (bodiesOfValue.length === 0) return unknown(options.trailers, true);
    parts.push(...bodiesOfValue);
  }
  if (parts.length === 0) return unknown(options.trailers);
  const trailers = options.trailers.length === 0 ? "" : `\n\n${options.trailers.join("\n")}`;
  return { kind: "message", message: `${parts.join("\n\n")}${trailers}` };
}

/** One extraction per `git commit` in the command (empty when it commits nothing). */
export function extractCommits(command: string): CommitExtraction[] {
  const { rest, bodies } = stripHeredocs(command);
  const resolution = resolveGit(rest);
  const lines = splitLines(rest);
  const found = resolution.invocations.flatMap((g) =>
    g.sub === "commit" ? [extractOne(g.args, heredocFrom(lines, g.line, bodies), bodies)] : [],
  );
  const hidden = opaqueMentions(resolution, "commit");
  return hidden ? [...found, unknown()] : found;
}

/** The first commit a shell command makes: its message, or why it cannot be known. */
export function extractCommit(command: string): CommitExtraction {
  return extractCommits(command)[0] ?? { kind: "not-commit" };
}
