import { opaqueMentions, resolveGit } from "./git-invocations.ts";

export type PushTarget = {
  readonly remote: string | undefined;
  /** Destination branch names named by refspecs; empty means "the current branch's default". */
  readonly branches: readonly string[];
  readonly allBranches: boolean;
  /** The refspecs name `HEAD`, so the current branch is pushed too. */
  readonly usesHead: boolean;
  /** `--tags` with no refspec: only tags are pushed, no branch. */
  readonly tagsOnly: boolean;
  /** Where the push runs when `cd`/`git -C` moved it away from the session's directory. */
  readonly dir?: string | undefined;
};

const VALUE_OPTIONS = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);
const isDynamic = (refspec: string): boolean => /[$`*?[]/.test(refspec);

/** A dry run pushes nothing. */
const isDryRun = (args: readonly string[]): boolean =>
  args.some((a) => a === "--dry-run" || a === "-n" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a));

const destination = (refspec: string): string => {
  const dst = refspec.includes(":") ? refspec.slice(refspec.lastIndexOf(":") + 1) : refspec;
  return dst.replace(/^\+/, "").replace(/^(?:refs\/)?heads\//, "");
};

type ParsedArgs = {
  positional: string[];
  all: boolean;
  tags: boolean;
  repo: string | undefined;
};

const VALUE_PREFIX = "--repo=";

function positionalArgs(args: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], all: false, tags: false, repo: undefined };
  let valueFor: "repo" | "skip" | undefined;
  for (const a of args) {
    if (valueFor === "repo") parsed.repo = a;
    if (valueFor !== undefined) valueFor = undefined;
    else if (a === "--repo") valueFor = "repo";
    else if (a.startsWith(VALUE_PREFIX)) parsed.repo = a.slice(VALUE_PREFIX.length);
    else if (VALUE_OPTIONS.has(a)) valueFor = "skip";
    else if (a === "--all" || a === "--mirror") parsed.all = true;
    else if (a === "--tags") parsed.tags = true;
    else if (!a.startsWith("-")) parsed.positional.push(a);
  }
  return parsed;
}

const toTarget = (args: readonly string[], dir: string | undefined): PushTarget => {
  const { positional, all, tags, repo } = positionalArgs(args);
  // With --repo, every positional argument is a refspec.
  const [remote, ...refspecs] = repo === undefined ? positional : [repo, ...positional];
  const destinations = refspecs.map(destination);
  const named = (b: string): boolean => b !== "HEAD" && b !== "" && !isDynamic(b);
  return {
    remote,
    branches: destinations.filter(named),
    allBranches: all || destinations.some(isDynamic),
    usesHead: destinations.includes("HEAD"),
    tagsOnly: tags && refspecs.length === 0 && !all,
    ...(dir === undefined ? {} : { dir }),
  };
};

/** The remote and branches of every `git push` in a command (empty list when there is no push). */
export function pushTargets(command: string): PushTarget[] {
  const resolution = resolveGit(command);
  const targets = resolution.invocations.flatMap((g) =>
    g.sub === "push" && !isDryRun(g.args) ? [toTarget(g.args, g.dir)] : [],
  );
  // git run through something opaque (xargs, `$CMD`): a push cannot be ruled out, so assume the worst.
  const opaquePush = opaqueMentions(resolution, "push");
  return opaquePush
    ? [
        ...targets,
        {
          remote: undefined,
          branches: [],
          allBranches: true,
          usesHead: false,
          tagsOnly: false,
          dir: undefined,
        },
      ]
    : targets;
}
