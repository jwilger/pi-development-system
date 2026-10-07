/** Runs a program; `pi.exec` satisfies this, tests pass a fake. */
export type Exec = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Exit code reported for a command that was killed for running too long (as `timeout(1)` does). */
export const TIMEOUT_CODE = 124;

/**
 * pi reports a killed command as `code: 0, killed: true`, so a timed-out `git diff` would look like an
 * empty diff. A guard must never read that as "nothing changed": make the kill a failure.
 */
export const timeoutAsFailure = (result: {
  code: number;
  stdout: string;
  stderr: string;
  killed?: boolean;
}): { code: number; stdout: string; stderr: string } =>
  result.killed === true
    ? {
        code: TIMEOUT_CODE,
        stdout: result.stdout,
        stderr: `${result.stderr}\ntimed out`.trim(),
      }
    : { code: result.code, stdout: result.stdout, stderr: result.stderr };
