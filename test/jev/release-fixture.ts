import { readFileSync } from "node:fs";
import type { judgeBump } from "../../scripts/lib/jev.ts";
import type { Bump } from "../../scripts/lib/semver.ts";

interface ReleaseCase {
  name: string;
  input: Parameters<typeof judgeBump>[0];
  expected: Bump;
}

/** Trusted, version-controlled cases; includes a sanitized historical published diff. */
export function releaseFixture(): { contractHash: string; cases: ReleaseCase[] } {
  return JSON.parse(
    readFileSync(new URL("../../evals/release/bump.json", import.meta.url), "utf8"),
  );
}
