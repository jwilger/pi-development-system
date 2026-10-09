import { hasRationaleBody, parseConventionalCommit } from "./commit-message.ts";

/** Why a commit message fails the repository's rule (Conventional subject, a body saying why), or undefined. */
export function messageProblem(message: string): string | undefined {
  const parsed = parseConventionalCommit(message);
  if (!parsed.ok) return parsed.error.message;
  return hasRationaleBody(message)
    ? undefined
    : "the message has no body explaining why the change was made";
}
