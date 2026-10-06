/** Runs a program; `pi.exec` satisfies this, tests pass a fake. */
export type Exec = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;
