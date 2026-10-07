/**
 * Paths whose changes can alter what a Jev question means or how it is judged: the Jev client
 * and questions, their fixtures, the live fixture tests and their runner. A change to any of
 * them must pass the live-model fixtures (`npm run test:jev`) before it is committed or merged.
 */
export const JEV_FACING_PATHS: readonly string[] = [
  "src/jev/",
  "evals/jev/",
  "test/live/",
  "test/jev/fixture-runner.ts",
];

export const touchesJevFacing = (paths: readonly string[]): boolean =>
  paths.some((path) => JEV_FACING_PATHS.some((prefix) => path.startsWith(prefix)));
