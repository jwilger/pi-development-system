/**
 * Fake credentials for redaction tests. They are assembled at run time from fragments so no
 * secret-shaped literal sits in the repository (secret scanners flag those, and a real
 * scanner finding must never be waved off as "just a fixture").
 */
const glue = (...parts: string[]): string => parts.join("");

export const fakeEnvToken = (name: string, value: string): string => glue(name, "=", value);
export const fakeGithubToken = (): string => glue("gh", "p_", "abcdefghijklmnopqrstuv1234");
export const fakeGitlabToken = (): string => glue("gl", "pat-", "abcdefghij0123456789");
export const fakeBearerHeader = (value: string): string =>
  glue("Authorization: ", "Bearer ", value);
export const fakePrivateKey = (kind: string, ...body: string[]): string =>
  [
    glue("-----BEGIN ", kind, " PRIVATE KEY-----"),
    ...body,
    glue("-----END ", kind, " PRIVATE KEY-----"),
  ].join("\n");

/** A secret-shaped value with no recognisable literal in the source. */
export const fakeSecretValue = (): string => glue("abcdef", "1234", "56789");
