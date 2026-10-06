import { resolveGit } from "./git-invocations.ts";

export type CommitExtraction =
  | { readonly kind: "not-commit" }
  | { readonly kind: "message"; readonly message: string }
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "unknown"; readonly trailers: readonly string[] };

const HEREDOC =
  /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;

/** Heredoc bodies are data: take them out so their quotes cannot confuse line splitting. */
function stripHeredocs(command: string): { rest: string; bodies: string[] } {
  const bodies: string[] = [];
  const rest = command.replace(HEREDOC, (_all, _quote, _tag, body: string) => {
    bodies.push(body);
    return "\n";
  });
  return { rest, bodies };
}

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

/** Reads the message/file/trailer option starting at args[i], in any of its spellings. */
function parseArg(args: readonly string[], i: number): Parsed | undefined {
  const a = args[i] ?? "";
  for (const [name, kind] of LONG) {
    if (a === name) return { kind, value: args[i + 1], next: i + 2 };
    if (a.startsWith(`${name}=`)) return { kind, value: a.slice(name.length + 1), next: i + 1 };
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

/** The commit message a `git commit` shell command will use, or why it cannot be known. */
export function extractCommit(command: string): CommitExtraction {
  const { rest, bodies } = stripHeredocs(command);
  const heredoc = bodies[0]?.trim();
  const resolution = resolveGit(rest);
  const commit = resolution.invocations.find((g) => g.sub === "commit");
  if (commit === undefined) {
    return resolution.opaque && /\bcommit\b/.test(command) ? unknown() : { kind: "not-commit" };
  }
  const options = readOptions(commit.args);
  if (options.file === "-" && heredoc !== undefined) return { kind: "message", message: heredoc };
  if (options.file !== undefined) return { kind: "file", path: options.file };
  if (options.opaque) {
    return heredoc === undefined
      ? unknown(options.trailers)
      : { kind: "message", message: heredoc };
  }
  if (options.messages.length === 0) return unknown(options.trailers);
  const trailers = options.trailers.length === 0 ? "" : `\n\n${options.trailers.join("\n")}`;
  return { kind: "message", message: `${options.messages.join("\n\n")}${trailers}` };
}
