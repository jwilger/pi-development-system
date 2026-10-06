import { resolveGit } from "./git-invocations.ts";

export type PushTarget = {
  readonly remote: string | undefined;
  /** Destination branch names named by refspecs; empty means "the current branch's default". */
  readonly branches: readonly string[];
  readonly allBranches: boolean;
  /** Where the push runs when `cd`/`git -C` moved it away from the session's directory. */
  readonly dir?: string | undefined;
};

const VALUE_OPTIONS = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);
const isDynamic = (refspec: string): boolean => /[$`*?[]/.test(refspec);

const destination = (refspec: string): string => {
  const dst = refspec.includes(":") ? refspec.slice(refspec.lastIndexOf(":") + 1) : refspec;
  return dst.replace(/^\+/, "").replace(/^(?:refs\/)?heads\//, "");
};

type ParsedArgs = { positional: string[]; all: boolean; repo: string | undefined };

const VALUE_PREFIX = "--repo=";

function positionalArgs(args: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], all: false, repo: undefined };
  let valueFor: "repo" | "skip" | undefined;
  for (const a of args) {
    if (valueFor === "repo") parsed.repo = a;
    if (valueFor !== undefined) valueFor = undefined;
    else if (a === "--repo") valueFor = "repo";
    else if (a.startsWith(VALUE_PREFIX)) parsed.repo = a.slice(VALUE_PREFIX.length);
    else if (VALUE_OPTIONS.has(a)) valueFor = "skip";
    else if (a === "--all" || a === "--mirror") parsed.all = true;
    else if (!a.startsWith("-")) parsed.positional.push(a);
  }
  return parsed;
}

const toTarget = (args: readonly string[], dir: string | undefined): PushTarget => {
  const { positional, all, repo } = positionalArgs(args);
  // With --repo, every positional argument is a refspec.
  const [remote, ...refspecs] = repo === undefined ? positional : [repo, ...positional];
  const destinations = refspecs.map(destination);
  const named = (b: string): boolean => b !== "HEAD" && b !== "" && !isDynamic(b);
  return {
    remote,
    branches: destinations.filter(named),
    allBranches: all || destinations.some(isDynamic),
    ...(dir === undefined ? {} : { dir }),
  };
};

/** The remote and branches of every `git push` in a command (empty list when there is no push). */
export function pushTargets(command: string): PushTarget[] {
  const resolution = resolveGit(command);
  const targets = resolution.invocations.flatMap((g) =>
    g.sub === "push" ? [toTarget(g.args, g.dir)] : [],
  );
  // git run through something opaque (xargs, `$CMD`): a push cannot be ruled out, so assume the worst.
  const opaquePush = resolution.opaque && /\bpush\b/.test(command);
  return opaquePush
    ? [...targets, { remote: undefined, branches: [], allBranches: true }]
    : targets;
}
