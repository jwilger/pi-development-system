import { basename, isAssignment, segments, splitLines, WRAPPERS } from "./git-intent.ts";
import { redactSecrets } from "./redact.ts";

const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const DIRECT_RUNNERS = new Set(["vitest", "jest", "pytest", "mocha", "ava", "tap"]);
const EXEC_PREFIX = new Set(["npx", "bunx", "pnpx"]);
const SUMMARY_LINES = 3;
const SUMMARY_MAX = 300;

/** Words after wrappers (`time`, `timeout 60`, `env`), assignments and `+toolchain` selectors. */
function commandWords(words: readonly string[]): string[] {
  let i = 0;
  while (i < words.length) {
    const word = words[i] ?? "";
    const wrapper = WRAPPERS.has(basename(word)) || basename(word) === "timeout";
    if (isAssignment(word)) i += 1;
    else if (wrapper) {
      i += 1;
      while (i < words.length && /^(?:-|\d+[smhd]?$)/.test(words[i] ?? "")) i += 1;
    } else break;
  }
  return words.slice(i);
}

function isRunner(words: readonly string[]): boolean {
  const [head, ...rest] = words.map((w, i) => (i === 0 ? basename(w) : w));
  if (head === undefined) return false;
  const args = rest.filter((w) => !w.startsWith("+"));
  const first = args[0];
  if (head === "cargo") return first === "test" || first === "nextest";
  if (head === "go" || head === "deno") return first === "test";
  if (head === "node") return rest.includes("--test");
  if (head === "python" || head === "python3")
    return first === "-m" && /^(?:pytest|unittest)$/.test(args[1] ?? "");
  if (DIRECT_RUNNERS.has(head)) return true;
  if (EXEC_PREFIX.has(head)) return DIRECT_RUNNERS.has(first ?? "");
  if (PACKAGE_MANAGERS.has(head)) {
    if (first === "test" || first === "t") return true;
    return first === "run" && /^test(?::|$)/.test(args[1] ?? "");
  }
  return false;
}

/** Whether any simple command in `command` runs a test suite (`cargo test`, `npm test`, `vitest`, ...). */
export function isTestRunnerCommand(command: string): boolean {
  return splitLines(command).some((line) =>
    segments(line).some((words) => isRunner(commandWords(words))),
  );
}

export type ResultLike = {
  readonly isError: boolean;
  readonly text: string;
  readonly structured?: unknown;
  /** The command that ran; used to tell whether its exit status could have been masked. */
  readonly command?: string;
};

/** A pipe or sequence makes the shell report the last command's status, not the runner's. */
const MASKS_STATUS = /\||;/;
const FAILURE_MARKERS =
  /^# fail [1-9]|test result: FAILED|\b[1-9]\d* (?:failed|failing)\b|^FAILED\b|^FAIL\b|\bnot ok\b/m;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Exit code of a bash tool result: structured `exit_code`, else pi's status line, else error/not. */
export function exitCodeOf(result: ResultLike): number {
  if (isRecord(result.structured) && typeof result.structured.exit_code === "number") {
    return result.structured.exit_code;
  }
  const line = /Command exited with code (\d+)\s*$/.exec(result.text);
  if (line?.[1] !== undefined) return Number(line[1]);
  if (result.isError) return 1;
  // `npm test | tail` exits 0 whatever the tests did; trust the output over the masked status.
  const masked = result.command !== undefined && MASKS_STATUS.test(result.command);
  return masked && FAILURE_MARKERS.test(result.text) ? 1 : 0;
}

/** The last few non-empty output lines, redacted and bounded: what the runner said at the end. */
export function summarizeOutput(output: string): string {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^Command exited with code \d+$/.test(l));
  return redactSecrets(lines.slice(-SUMMARY_LINES).join(" | ")).slice(0, SUMMARY_MAX);
}
