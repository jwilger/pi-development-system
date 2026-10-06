import { type ParseEntry, parse } from "shell-quote";

/**
 * shell-quote throws on text that is valid shell or valid file content (a template literal inside a
 * heredoc), and a guard must never crash the tool call. Retry with the `${` openers neutralised, then
 * fall back to whitespace-split words so command classification still sees every token.
 */
export function parseShell(line: string, env?: (name: string) => string): ParseEntry[] {
  const attempt = (text: string): ParseEntry[] | undefined => {
    try {
      return env === undefined ? parse(text) : parse(text, env);
    } catch {
      return undefined;
    }
  };
  return (
    attempt(line) ??
    attempt(line.replaceAll("${", "$")) ??
    line.split(/\s+/).filter((word) => word !== "")
  );
}
