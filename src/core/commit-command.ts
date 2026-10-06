import { resolveGit } from "./git-invocations.ts";

export type CommitExtraction =
  | { readonly kind: "not-commit" }
  | { readonly kind: "message"; readonly message: string }
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "unknown"; readonly trailers: readonly string[] };

const HEREDOC =
  /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;

/** Heredoc bodies are data: take them out so their quotes cannot confuse line splitting. */
function stripHeredocs(command: string): { rest: string; bodies: Heredoc[] } {
  const bodies: Heredoc[] = [];
  const rest = command.replace(HEREDOC, (...m: unknown[]) => {
    bodies.push({ body: String(m[3]), at: Number(m[m.length - 2]) });
    return "\n";
  });
  return { rest, bodies };
}

type Heredoc = { readonly body: string; readonly at: number };

type Options = {
  messages: string[];
  trailers: string[];
  file: string | undefined;
  opaque: boolean;
};

type Parsed = {
  readonly kind: "message" | "file" | "trailer";
  readonly value: string | undefined;
  /** Index of the next argument to read. */
  readonly next: number;
};

const LONG: ReadonlyArray<readonly [string, Parsed["kind"]]> = [
  ["--message", "message"],
  ["--file", "file"],
  ["--trailer", "trailer"],
];

/** The option a `--name`/`--na=value` spelling means; git accepts any unambiguous prefix (3+ chars). */
function longOption(arg: string): { kind: Parsed["kind"]; inline: string | undefined } | undefined {
  if (!arg.startsWith("--")) return undefined;
  const eq = arg.indexOf("=");
  const name = eq < 0 ? arg : arg.slice(0, eq);
  if (name.length < 5) return undefined;
  const hit = LONG.find(([long]) => long.startsWith(name));
  return hit === undefined
    ? undefined
    : { kind: hit[1], inline: eq < 0 ? undefined : arg.slice(eq + 1) };
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

function readOptions(args: readonly string[]): Options {
  const options: Options = { messages: [], trailers: [], file: undefined, opaque: false };
  let i = 0;
  while (i < args.length) {
    const parsed = parseArg(args, i);
    i = parsed?.next ?? i + 1;
    if (parsed === undefined) continue;
    if (parsed.kind === "file") options.file = parsed.value;
    else if (parsed.kind === "trailer") options.trailers.push(parsed.value ?? "");
    else if (parsed.value === undefined || /\$\(|`/.test(parsed.value)) options.opaque = true;
    else options.messages.push(parsed.value);
  }
  return options;
}

const unknown = (trailers: readonly string[] = []): CommitExtraction => ({
  kind: "unknown",
  trailers,
});

const STDIN_PATHS = new Set(["-", "/dev/stdin", "/proc/self/fd/0"]);

/** The heredoc that is this commit's input: the first one written after the word `commit`. */
const heredocFor = (command: string, bodies: readonly Heredoc[]): string | undefined => {
  const from = command.search(/\bcommit\b/);
  return bodies.find((h) => h.at >= from)?.body.trim();
};

function extractOne(args: readonly string[], heredoc: string | undefined): CommitExtraction {
  const options = readOptions(args);
  if (options.file !== undefined && STDIN_PATHS.has(options.file)) {
    return heredoc === undefined
      ? unknown(options.trailers)
      : { kind: "message", message: heredoc };
  }
  if (options.file !== undefined) return { kind: "file", path: options.file };
  const parts = [...options.messages];
  if (options.opaque) {
    if (heredoc === undefined) return unknown(options.trailers);
    parts.push(heredoc);
  }
  if (parts.length === 0) return unknown(options.trailers);
  const trailers = options.trailers.length === 0 ? "" : `\n\n${options.trailers.join("\n")}`;
  return { kind: "message", message: `${parts.join("\n\n")}${trailers}` };
}

/** One extraction per `git commit` in the command (empty when it commits nothing). */
export function extractCommits(command: string): CommitExtraction[] {
  const { rest, bodies } = stripHeredocs(command);
  const resolution = resolveGit(rest);
  const heredoc = heredocFor(command, bodies);
  const commits = resolution.invocations.filter((g) => g.sub === "commit");
  const found = commits.map((g) => extractOne(g.args, heredoc));
  const hidden = resolution.opaque && /\bcommit\b/.test(command);
  return hidden ? [...found, unknown()] : found;
}

/** The first commit a shell command makes: its message, or why it cannot be known. */
export function extractCommit(command: string): CommitExtraction {
  return extractCommits(command)[0] ?? { kind: "not-commit" };
}
