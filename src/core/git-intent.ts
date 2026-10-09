import { parseShell } from "./shell-parse.ts";

export type GitIntent =
  | "history-rewrite"
  | "force-push"
  | "branch-delete-remote"
  | "destructive-reset"
  | "no-verify"
  | "ordinary"
  | "unknown";

/** Highest severity first. */
const SEVERITY: ReadonlyArray<GitIntent> = [
  "force-push",
  "branch-delete-remote",
  "history-rewrite",
  "destructive-reset",
  "no-verify",
  "unknown",
  "ordinary",
];

const worst = (a: GitIntent, b: GitIntent): GitIntent =>
  SEVERITY.indexOf(a) <= SEVERITY.indexOf(b) ? a : b;

/** Splits a command string on newlines that are outside quotes; backslash-newline is a continuation. */
// biome-ignore-start lint/complexity/noExcessiveCognitiveComplexity: a shell lexer is one flat branch per character class; splitting it would scatter a single state machine across helpers
// pi-lens-ignore: high-complexity -- a shell lexer is one flat branch per character class; splitting it would scatter one state machine across helpers
export function splitLines(command: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command.charAt(i);
    if (quote === '"' && ch === "\\") {
      current += ch + command.charAt(i + 1);
      i++;
    } else if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      current += ch;
    } else if (ch === "\\" && command.charAt(i + 1) === "\n") {
      i++;
    } else if (ch === "#" && (current === "" || /\s$/.test(current))) {
      // A comment runs to the end of the line; quotes inside it do not open a quote.
      while (i < command.length && command.charAt(i) !== "\n") current += command.charAt(i++);
      i--;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === "\n") {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  lines.push(current);
  return lines;
}
// biome-ignore-end lint/complexity/noExcessiveCognitiveComplexity: end of the shell lexer above

const isRedirect = (op: string): boolean => /^[<>]/.test(op) && !op.endsWith("(");

/** Tokens of one line grouped into simple commands (operators separate segments; redirects and their operands are dropped). */
export function segments(line: string): string[][] {
  const result: string[][] = [[]];
  let skipOperand = false;
  for (const token of parseShell(line, (name) => `$${name}`)) {
    const current = result.at(-1);
    if (typeof token === "string" || "pattern" in token) {
      const text = typeof token === "string" ? token : token.pattern;
      if (!skipOperand) current?.push(text);
      skipOperand = false;
    } else if ("op" in token && isRedirect(token.op)) {
      // `2>&1`, `>/dev/null`: the file descriptor before it and the target after it are not arguments.
      if (/^\d+$/.test(current?.at(-1) ?? "")) current?.pop();
      skipOperand = true;
    } else if (!("comment" in token)) {
      result.push([]);
      skipOperand = false;
    }
  }
  return result.filter((s) => s.length > 0);
}

export const WRAPPERS = new Set([
  "command",
  "sudo",
  "env",
  "time",
  "nohup",
  "exec",
  "builtin",
  "nice",
]);
export const KEYWORDS = new Set([
  "then",
  "do",
  "else",
  "elif",
  "if",
  "while",
  "until",
  "{",
  "!",
  "time",
]);
export const DATA_ONLY = new Set([
  "echo",
  "printf",
  "cat",
  "grep",
  "rg",
  "man",
  "which",
  "type",
  "head",
  "tail",
]);
export const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "csh", "tcsh"]);
export const OPAQUE = new Set(["xargs", "ssh", "find", "parallel", "watch"]);
export const GLOBAL_WITH_VALUE = new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--super-prefix",
]);

/** Assignments that switch git hooks off (lefthook, husky), however the value is spelled. */
const skipsHooks = (word: string): boolean =>
  /^(LEFTHOOK|HUSKY)=(0|false|no|off)$/i.test(word) ||
  /^(LEFTHOOK_EXCLUDE|HUSKY_SKIP_HOOKS)=.+/i.test(word);
/** Assignments that feed git configuration (aliases, hooks path, push targets) from the environment. */
const setsGitConfig = (word: string): boolean =>
  /^GIT_CONFIG_[A-Z_0-9]*=/.test(word) ||
  /^(HOME|XDG_CONFIG_HOME)=/.test(word) || // git reads its global config from there
  (/^(GIT_(SSH|SSH_COMMAND|EDITOR|SEQUENCE_EDITOR|PAGER|ASKPASS|EXTERNAL_DIFF|PROXY_COMMAND|EXEC_PATH)|EDITOR|VISUAL|PAGER)=/.test(
    word,
  ) &&
    !isBenignProgram(word.slice(word.indexOf("=") + 1)));
/** A bare program name (`true`, `cat`, `less`) that is neither git, a shell nor an interpreter: it cannot run a push. */
const isBenignProgram = (value: string): boolean =>
  /^[\w.+-]+$/.test(value) && !isCommandWord(value);
/** Builtins that set variables for the commands after them. */
const ENV_SETTERS = new Set(["export", "declare", "typeset", "readonly", "local"]);
/** Commands that run another command (or a shell script) given as their arguments. */
const RUNNERS = new Set([
  "timeout",
  "script",
  "busybox",
  "setsid",
  "stdbuf",
  "ionice",
  "flock",
  "doas",
  "su",
  "runuser",
  "xvfb-run",
  "unbuffer",
  "strace",
  "ltrace",
  "taskset",
  "chrt",
  "nsenter",
  "chroot",
  "bwrap",
  "firejail",
]);
const INTERPRETERS = /^(python[\d.]*|node(js)?|ruby|perl|php|deno|bun|lua|tclsh|osascript)$/;
const INLINE_CODE_FLAG = /^(-[A-Za-z]*[cepEr]|--eval|--print|eval)$/;
/** Paths a program reads its standard input through. */
const STDIN_PATH = /^(-|\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/(self|\d+)\/fd\/\d+)$/;
const INFO_FLAG = /^(-[Vh]|--version|--help)$/;
/** `node -v`, `ruby -v`, `perl -v` print a version; for python `-v` is verbose and still reads stdin. */
const VERSION_FLAG = /^-v$/;

/** Every subcommand git itself provides; any other word is an alias or an external `git-<word>`. */
export const GIT_SUBCOMMANDS = new Set(
  `add am annotate apply archive bisect blame branch bundle cat-file check-attr check-ignore
  check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit
  commit-graph commit-tree config count-objects credential describe diff diff-files diff-index
  diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch filter-repo
  for-each-ref for-each-repo format-patch fsck gc gitk grep gui hash-object help hook index-pack
  init instaweb interpret-trailers lfs log ls-files ls-remote ls-tree maintenance merge
  merge-base merge-file merge-index merge-tree mergetool mktag mktree mv name-rev notes pack-objects
  pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase reflog remote repack
  replace request-pull rerere reset restore rev-list rev-parse revert rm scalar send-email
  shortlog show show-branch show-index show-ref sparse-checkout stash status stripspace submodule
  switch symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info
  var verify-commit verify-pack verify-tag version whatchanged worktree write-tree bugreport diagnose
  multi-pack-index refs repo mailinfo mailsplit upload-pack receive-pack upload-archive daemon
  get-tar-commit-id difftool--helper maintenance backfill`.split(/\s+/),
);

export const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
export const isAssignment = (t: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);

/** True when `arg` is `name` or an unambiguous-looking git abbreviation of it (`--amen`, `--del=x`). */
const isLong = (arg: string, ...names: string[]): boolean => {
  const key = arg.split("=")[0] ?? "";
  return key.length >= 4 && key.startsWith("--") && names.some((n) => n.startsWith(key));
};

/** Keys whose value git runs as a command: setting one makes a later, harmless-looking command run anything. */
const RUNS_COMMAND =
  /^(core\.(sshcommand|editor|pager|fsmonitor|askpass)|diff\.external|sequence\.editor|credential(\..+)?\.helper|gpg(\..+)?\.program|filter\..+\.(clean|smudge|process)|diff\..+\.(textconv|command)|merge\..+\.driver|(merge|diff)tool\..+\.cmd|pager\..+|uploadpack\.packobjectshook|url\..+\.(insteadof|pushinsteadof))$/;

/** What setting this configuration key can do to a later git command. */
function configKeyIntent(key: string, value?: string): GitIntent {
  const k = key.toLowerCase();
  if (k === "core.hookspath") return "no-verify";
  const runsCommand = RUNS_COMMAND.test(k) && !(value !== undefined && isBenignProgram(value));
  const redirects =
    k.startsWith("alias.") ||
    k.startsWith("include.") ||
    k.startsWith("includeif.") ||
    runsCommand ||
    /^remote\..+\.(push|mirror|pushurl)$/.test(k) ||
    k === "push.default";
  return redirects ? "unknown" : "ordinary";
}

const READS_CONFIG = /^--(get|get-all|get-regexp|list|unset|unset-all)$|^-l$/;

/** `git config` options that take a value: `--comment --get` is a comment, not a lookup. */
const CONFIG_VALUE_OPTIONS = new Set([
  "--comment",
  "-f",
  "--file",
  "--blob",
  "--type",
  "--default",
  "--value",
]);

/** The words with each value-taking option's value removed. */
const withoutOptionValues = (args: string[]): string[] =>
  args.filter((_, k) => !CONFIG_VALUE_OPTIONS.has(args[k - 1] ?? ""));

function classifyConfig(args: string[]): GitIntent {
  // `git config get|list|unset ...` (newer spelling) never sets a value.
  if (["get", "list", "unset"].includes(args[0] ?? "")) return "ordinary";
  // git stops reading options at the first plain word: `config k v --get` still writes k.
  const options = args.slice(
    0,
    Math.max(
      0,
      args.findIndex((a) => !a.startsWith("-")),
    ),
  );
  const leading = args.findIndex((a) => !a.startsWith("-")) < 0 ? args : options;
  if (withoutOptionValues(leading).some((a) => READS_CONFIG.test(a))) return "ordinary";
  const plain = withoutOptionValues(args).filter((a) => !a.startsWith("-"));
  // A key with no value is a lookup (`git config core.hooksPath`), not a write.
  if (plain.length < 2) return "ordinary";
  return plain.reduce<GitIntent>(
    (acc, a, k) => worst(acc, configKeyIntent(a, plain[k + 1])),
    "ordinary",
  );
}

/** `push`: forcing, mirroring or deleting on the remote. */
function classifyPush(intent: GitIntent, args: string[]): GitIntent {
  const shortFlags = args.filter((a) => /^-[A-Za-z]+$/.test(a));
  if (
    args.some((a) =>
      isLong(a, "--force", "--force-with-lease", "--force-if-includes", "--mirror"),
    ) ||
    shortFlags.some((a) => a.includes("f")) ||
    args.some((a) => /^\+\S/.test(a))
  ) {
    return worst(intent, "force-push");
  }
  if (
    args.some((a) => isLong(a, "--delete", "--prune")) ||
    shortFlags.includes("-d") ||
    args.some((a) => /^:\S/.test(a))
  ) {
    return worst(intent, "branch-delete-remote");
  }
  return intent;
}

/** Pathspecs that cover the whole working tree. */
const WHOLE_TREE = new Set([".", "./", ":/", ":/.", "*"]);

/** `checkout`/`restore`/`clean` forms that throw uncommitted work away, as `reset --hard` does. */
function discardsWork(sub: "checkout" | "restore" | "clean", args: string[]): boolean {
  const shortFlags = args.filter((a) => /^-[A-Za-z]+$/.test(a));
  if (sub === "clean") {
    if (args.some((a) => isLong(a, "--dry-run")) || shortFlags.some((a) => a.includes("n"))) {
      return false;
    }
    return args.some((a) => isLong(a, "--force")) || shortFlags.some((a) => a.includes("f"));
  }
  const wholeTree = args.some((a) => WHOLE_TREE.has(a));
  if (sub === "restore") {
    // `restore --staged .` only unstages; naming the worktree too restores it.
    const staged =
      args.some((a) => isLong(a, "--staged")) || shortFlags.some((a) => a.includes("S"));
    const worktree =
      args.some((a) => isLong(a, "--worktree")) || shortFlags.some((a) => a.includes("W"));
    const stagedOnly = staged && !worktree;
    return wholeTree && !stagedOnly;
  }
  return (
    wholeTree || args.some((a) => isLong(a, "--force")) || shortFlags.some((a) => a.includes("f"))
  );
}

function classifyGitArgs(globals: string[], sub: string | undefined, args: string[]): GitIntent {
  let intent: GitIntent = "ordinary";
  for (const g of globals) {
    const eq = g.indexOf("=");
    intent = worst(
      intent,
      configKeyIntent(eq < 0 ? g : g.slice(0, eq), eq < 0 ? undefined : g.slice(eq + 1)),
    );
  }
  if (sub !== undefined && !sub.startsWith("$") && !GIT_SUBCOMMANDS.has(sub)) {
    intent = worst(intent, "unknown");
  }
  if (args.some((a) => isLong(a, "--no-verify"))) intent = worst(intent, "no-verify");
  switch (sub) {
    case "push":
      return classifyPush(intent, args);
    case "commit":
      if (args.some((a) => isLong(a, "--amend"))) return worst(intent, "history-rewrite");
      if (args.some((a) => /^-[A-Za-z]*n[A-Za-z]*$/.test(a))) return worst(intent, "no-verify");
      return intent;
    case "rebase":
      return args.some((a) => ["--abort", "--continue", "--skip", "--quit"].includes(a))
        ? intent
        : worst(intent, "history-rewrite");
    case "config":
      return worst(intent, classifyConfig(args));
    case "remote":
      // `remote add --mirror=push` / `set-url --push` make a later plain push mirror or redirect.
      return args.some((a) => /^--(mirror|push)/.test(a)) ? worst(intent, "unknown") : intent;
    case "filter-branch":
    case "filter-repo":
      return worst(intent, "history-rewrite");
    case "reset":
      return args.some((a) => isLong(a, "--hard")) ? worst(intent, "destructive-reset") : intent;
    case "checkout":
    case "restore":
    case "clean":
      return discardsWork(sub, args) ? worst(intent, "destructive-reset") : intent;
    default:
      return intent;
  }
}

/** Skips leading `NAME=value` words, wrappers and shell keywords; `index` is the command word (-1: none). */
function skipPrefix(tokens: string[]): { index: number; env: GitIntent } {
  let env: GitIntent = "ordinary";
  let index = 0;
  for (;;) {
    const t = tokens[index];
    if (t === undefined) return { index: -1, env };
    if (isAssignment(t)) env = worst(env, assignmentIntent(t));
    else if (!(WRAPPERS.has(t) || KEYWORDS.has(t))) return { index, env };
    index++;
  }
}

/** What one `NAME=value` word does to the git commands that run with it. */
function assignmentIntent(word: string): GitIntent {
  if (skipsHooks(word)) return "no-verify";
  return setsGitConfig(word) ? "unknown" : "ordinary";
}

/** `--config-env=key=VAR`: the value is a variable's name, whatever that variable holds; only the key is known. */
const envConfigKey = (pair: string): string => pair.split("=")[0] ?? "";

/** Git's global options (`-c k=v`, `-C dir`, flags) before the subcommand. */
function splitGlobals(rest: string[]): {
  globals: string[];
  sub: string | undefined;
  args: string[];
} {
  const globals: string[] = [];
  let j = 0;
  while (j < rest.length && (rest[j] ?? "").startsWith("-")) {
    const opt = rest[j] ?? "";
    if (opt.startsWith("--config-env=")) {
      globals.push(envConfigKey(opt.slice("--config-env=".length)));
      j++;
    } else if (GLOBAL_WITH_VALUE.has(opt)) {
      const value = rest[j + 1] ?? "";
      globals.push(opt === "--config-env" ? envConfigKey(value) : value);
      j += 2;
    } else {
      j++;
    }
  }
  return { globals, sub: rest[j], args: rest.slice(j + 1) };
}

/** A shell started without a script to run reads its commands from stdin, which cannot be seen. */
function classifyShell(rest: string[]): GitIntent {
  const c = rest.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t));
  const script = c >= 0 ? rest[c + 1] : undefined;
  if (script !== undefined) return classifyGitCommand(script);
  return readsStdin(rest) ? "unknown" : "ordinary";
}

/** No script file among the arguments (or `-s`, or a stdin path): the program reads its code from stdin. */
const readsStdin = (rest: string[]): boolean =>
  rest.includes("-s") ||
  rest.some((t) => STDIN_PATH.test(t)) ||
  rest.every((t) => t.startsWith("-"));

/** A word that starts a command worth reading: git, a shell, or an interpreter that may run either. */
const isCommandWord = (word: string): boolean => {
  const base = basename(word);
  return base === "git" || SHELLS.has(base) || INTERPRETERS.test(base);
};

/** `timeout 5 bash -c '…'`, `script -qc '…'`: the wrapped command is a later word or a script string. */
function classifyRunner(rest: string[]): GitIntent {
  let intent: GitIntent = "ordinary";
  for (const [k, word] of rest.entries()) {
    // Everything after the command word is that command's own arguments, not more commands.
    if (isCommandWord(word)) {
      return worst(intent, classifySegment(rest.slice(k)));
    }
    if (isAssignment(word)) intent = worst(intent, assignmentIntent(word));
    else if (/\s/.test(word)) intent = worst(intent, classifyGitCommand(word));
  }
  return intent;
}

/** `python3 -c '…git…'`: code that may run git by any means cannot be read. */
const interpreterRunsGit = (rest: string[], isPython: boolean): boolean => {
  const inline = rest.some((t) => INLINE_CODE_FLAG.test(t));
  // Inline code that mentions git, or a script read from stdin (pipe, heredoc): either can run any git.
  if (inline) return rest.some((t) => /\bgit\b/.test(t) && !t.startsWith("-"));
  if (rest.some((t) => INFO_FLAG.test(t) || (VERSION_FLAG.test(t) && !isPython))) return false;
  // `node --test` is a runner, not stdin; flags alone (`python3 -u`) still read it, so does a stdin path.
  const runs = rest.some((t) => /^--(test|run|check|watch)\b/.test(t));
  return !runs && (rest.every((t) => t.startsWith("-")) || rest.some((t) => STDIN_PATH.test(t)));
};

/** `export LEFTHOOK=0`: the assignment outlives the command, so the commands after it skip hooks. */
const classifyExport = (rest: string[]): GitIntent =>
  rest.reduce<GitIntent>(
    (acc, t) => worst(acc, isAssignment(t) ? assignmentIntent(t) : "ordinary"),
    "ordinary",
  );

/** The command line `env -S` / `--split-string` carries, if there is one. */
function splitStringValue(rest: string[]): string | undefined {
  for (const [k, t] of rest.entries()) {
    if (t === "-S" || t === "--split-string") return rest[k + 1];
    if (t.startsWith("--split-string=")) return t.slice("--split-string=".length);
    if (/^-S./.test(t)) return t.slice(2);
  }
  return undefined;
}

/** A command that is not git, a shell or an assignment: it may still wrap or script a git command. */
function classifyOtherCommand(base: string, rest: string[]): GitIntent {
  if (DATA_ONLY.has(base)) return "ordinary";
  if (RUNNERS.has(base)) return classifyRunner(rest);
  if (INTERPRETERS.test(base) && interpreterRunsGit(rest, base.startsWith("python")))
    return "unknown";
  // `env -S "git push -f"` splits its value into a command line.
  const split = splitStringValue([base, ...rest]);
  if (split !== undefined) return classifyGitCommand(split);
  // Wrapper with options (`sudo -E bash -c ...`, `env -i git ...`): classify from the git or shell token.
  // Only an option-shaped head means a skipped wrapper's options (`command -v node` is a lookup);
  // otherwise just a literal `git` among the words counts (`brew install node` runs nothing).
  const wrapperOptions = base.startsWith("-") && !/^-[vV]$/.test(base);
  const at = wrapperOptions
    ? rest.findIndex(isCommandWord)
    : rest.findIndex((t) => basename(t) === "git");
  if (at < 0) return "ordinary";
  // `apt install git curl`, `brew install git gh`: a `git` argument followed by another package name is data.
  const after = rest[at + 1];
  if (!wrapperOptions && after !== undefined && !/^[-$]/.test(after) && !GIT_SUBCOMMANDS.has(after))
    return "ordinary";
  // `env -i LEFTHOOK=0 git commit`: assignments among the wrapper's own words reach the command too.
  const env = rest
    .slice(0, at)
    .reduce<GitIntent>(
      (acc, t) => worst(acc, isAssignment(t) ? assignmentIntent(t) : "ordinary"),
      "ordinary",
    );
  return worst(env, classifySegment(rest.slice(at)));
}

/** Whether a command can start git itself (a runner, an interpreter, a wrapper's options, or a git/shell word). */
const runsCommands = (base: string, rest: string[]): boolean =>
  RUNNERS.has(base) ||
  INTERPRETERS.test(base) ||
  base.startsWith("-") ||
  rest.some((t) => basename(t) === "git" || SHELLS.has(basename(t)));

// pi-lens-ignore: high-fan-out -- the classifier dispatches one git word to many small predicates; it is a table, not coordination
function classifySegment(tokens: string[]): GitIntent {
  const { index: i, env } = skipPrefix(tokens);
  if (i < 0) return env;
  const head = tokens[i] ?? "";
  const rest = tokens.slice(i + 1);
  const base = basename(head);
  const withEnv = (found: GitIntent): GitIntent => worst(found, env);
  if (head.startsWith("$") || head.includes("`") || base === "$GIT") return "unknown";
  if (SHELLS.has(base)) return withEnv(classifyShell(rest));
  if (base === "eval") return withEnv(classifyGitCommand(rest.join(" ")));
  if (ENV_SETTERS.has(base)) return withEnv(classifyExport(rest));
  if (OPAQUE.has(base)) {
    return rest.some((t) => isCommandWord(t) || (/\s/.test(t) && /\bgit\b/.test(t)))
      ? "unknown"
      : "ordinary";
  }
  // `source /dev/stdin <<< '…'`: sourcing standard input runs code that cannot be read.
  if ((base === "source" || base === ".") && rest.some((t) => STDIN_PATH.test(t))) return "unknown";
  if (base.startsWith("git-") && GIT_SUBCOMMANDS.has(base.slice(4))) {
    return withEnv(classifyGitArgs([], base.slice(4), rest));
  }
  if (base !== "git") {
    const found = classifyOtherCommand(base, rest);
    // `HUSKY=0 npm ci` skips a hook installer, not a commit hook: the assignment counts only for commands that can run git.
    return runsCommands(base, rest) ? withEnv(found) : found;
  }
  const { globals, sub, args } = splitGlobals(rest);
  const dynamic =
    (sub ?? "").startsWith("$") ||
    (["push", "reset", "rebase"].includes(sub ?? "") &&
      args.some((t) => t.startsWith("$") || t.includes("`")));
  const intent = classifyGitArgs(globals, sub, args);
  return withEnv(dynamic ? worst(intent, "unknown") : intent);
}

/**
 * The parts of a line bash may still execute or treat as syntax: single-quoted text and
 * backslash-escaped characters are dropped; double-quoted text is kept unless `dropDouble`.
 */
// pi-lens-ignore: high-complexity -- a shell lexer is one flat branch per character class; splitting it would scatter one state machine across helpers
export function live(line: string, dropDouble: boolean): string {
  let out = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quote === "'") {
      if (ch === "'") quote = undefined;
    } else if (ch === "\\") {
      i++;
    } else if (quote === '"') {
      if (ch === '"') quote = undefined;
      else if (!dropDouble) out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Bodies of `$(...)` and backtick substitutions anywhere in the text (quoted or not). */
export function substitutions(text: string): string[] {
  const bodies: string[] = [];
  for (let at = text.indexOf("$("); at >= 0; at = text.indexOf("$(", at + 2)) {
    let depth = 1;
    let end = at + 2;
    for (; end < text.length && depth > 0; end++) {
      const ch = text.charAt(end);
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    bodies.push(text.slice(at + 2, depth === 0 ? end - 1 : end));
  }
  for (const m of text.matchAll(/`([^`]*)`/g)) bodies.push(m[1] ?? "");
  return bodies;
}

const HEREDOC = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/** The delimiter of a heredoc started by an unquoted `<<` on this line, if any. */
// pi-lens-ignore: high-complexity -- a shell lexer is one flat branch per character class; splitting it would scatter one state machine across helpers
export function heredocDelimiter(line: string): string | undefined {
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
    } else if (ch === "\\") {
      i++;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (line.startsWith("<<<", i)) {
      i += 2;
    } else if (ch === "<" && line.charAt(i + 1) === "<") {
      return HEREDOC.exec(line.slice(i))?.[2];
    }
  }
  return undefined;
}

/** The body of the heredoc that `delimiter` opened on line `from` of `lines` (empty when unterminated). */
function heredocBody(lines: readonly string[], from: number, delimiter: string): string {
  const body: string[] = [];
  for (const line of lines.slice(from + 1)) {
    if (line.trim() === delimiter) break;
    body.push(line);
  }
  return body.join("\n");
}

/**
 * Whether a script read from a heredoc cannot run git. An interpreter's body only has to avoid the word;
 * a shell's must also be plain words, because `g\it`, `gi""t` and `${G}t` build it without spelling it.
 */
const scriptCannotRunGit = (body: string, shell: boolean): boolean =>
  !/git/i.test(body) && (!shell || /^[\w\s./=:,@%+-]*$/.test(body));

/**
 * Classifies the most severe git intent in a shell command (deterministic fast path).
 * A script fed by a heredoc (`python3 - <<'EOF'`) is unreadable only if it may run git: when neither
 * the command line nor the body mentions git at all, it is not held for the user.
 */
export function classifyGitCommand(command: string): GitIntent {
  let intent: GitIntent = "ordinary";
  let heredocEnd: string | undefined;
  const lines = splitLines(command);
  for (const [index, line] of lines.entries()) {
    if (heredocEnd !== undefined) {
      if (line.trim() === heredocEnd) heredocEnd = undefined;
      continue;
    }
    const delimiter = heredocDelimiter(line);
    let lineIntent: GitIntent = "ordinary";
    for (const segment of segments(line)) lineIntent = worst(lineIntent, classifySegment(segment));
    for (const body of substitutions(live(line, false)))
      lineIntent = worst(lineIntent, classifyGitCommand(body));
    const gitFree =
      delimiter !== undefined &&
      !/git/i.test(line) &&
      !/[$`]/.test(line) && // `$CMD <<EOF` runs whatever the variable holds
      scriptCannotRunGit(
        heredocBody(lines, index, delimiter),
        segments(line).some((seg) => seg.some((t) => SHELLS.has(basename(t)))),
      );
    intent = worst(intent, lineIntent === "unknown" && gitFree ? "ordinary" : lineIntent);
    heredocEnd = delimiter ?? heredocEnd;
  }
  return intent;
}
