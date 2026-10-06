const HEREDOC =
  /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;

/**
 * Heredoc bodies are data: take them out so their quotes cannot confuse line splitting. The rest of
 * the opening line stays (`| git commit -F -`) with a `#HD<n>` marker naming the removed body.
 */
export function stripHeredocs(command: string): { rest: string; bodies: string[] } {
  const bodies: string[] = [];
  const rest = command.replace(HEREDOC, (...m: unknown[]) => {
    bodies.push(String(m[4]).trim());
    return `${String(m[3])} #HD${bodies.length - 1}\n`;
  });
  return { rest, bodies };
}
