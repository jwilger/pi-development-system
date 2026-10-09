/**
 * Commit messages whose missing rationale a recorded departure already excused at `git commit`, so the
 * push that publishes them does not ask for a second departure. In memory: a restart asks again, which
 * only costs a repeat departure.
 */
export type ExcusedMessages = {
  add(message: string): void;
  has(message: string): boolean;
};

const key = (message: string): string => message.trim();

export function createExcusedMessages(): ExcusedMessages {
  const seen = new Set<string>();
  return {
    add: (message) => {
      seen.add(key(message));
    },
    has: (message) => seen.has(key(message)),
  };
}
