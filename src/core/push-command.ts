import { opaqueMentions, resolveGit, runsDefinedAlias } from "./git-invocations.ts";

export type PushTarget = {
  readonly remote: string | undefined;
  /** Destination branch names named by refspecs; empty means "the current branch's default". */
  readonly branches: readonly string[];
  /** Local refs the refspecs push (`HEAD` in `HEAD:feature`); empty means the current branch. */
  readonly sources: readonly string[];
  readonly allBranches: boolean;
  /** The refspecs name `HEAD`, so the current branch is pushed too. */
  readonly usesHead: boolean;
  /** `--tags` with no refspec: only tags are pushed, no branch. */
  readonly tagsOnly: boolean;
  /** `--tags` beside named refspecs: every tag goes too, and a tag may sit on a commit no named branch has. */
  readonly withTags?: boolean;
  /** Every refspec deletes a ref (`--delete`, `:branch`): nothing is sent, so no commit is published. */
  readonly deleteOnly: boolean;
  /** Where the push runs when `cd`/`git -C` moved it away from the session's directory. */
  readonly dir?: string | undefined;
};

const VALUE_OPTIONS = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);
const isDynamic = (refspec: string): boolean => /[$`*?[]/.test(refspec);

/** A dry run pushes nothing. */
const isDryRun = (args: readonly string[]): boolean =>
  args.some((a) => a === "--dry-run" || a === "-n" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a));

const source = (refspec: string): string =>
  refspec.includes(":")
    ? refspec.slice(0, refspec.indexOf(":")).replace(/^\+/, "")
    : refspec.replace(/^\+/, "");

const destination = (refspec: string): string => {
  const dst = refspec.includes(":") ? refspec.slice(refspec.lastIndexOf(":") + 1) : refspec;
  return dst.replace(/^\+/, "").replace(/^(?:refs\/)?heads\//, "");
};

type ParsedArgs = {
  positional: string[];
  all: boolean;
  tags: boolean;
  deleting: boolean;
  repo: string | undefined;
};

const VALUE_PREFIX = "--repo=";

function applyFlag(parsed: ParsedArgs, a: string): void {
  if (a.startsWith(VALUE_PREFIX)) parsed.repo = a.slice(VALUE_PREFIX.length);
  else if (a === "--all" || a === "--mirror") parsed.all = true;
  else if (a === "--tags") parsed.tags = true;
  else if (a === "--delete" || a === "-d") parsed.deleting = true;
  else if (!a.startsWith("-")) parsed.positional.push(a);
}

function positionalArgs(args: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    positional: [],
    all: false,
    tags: false,
    deleting: false,
    repo: undefined,
  };
  let valueFor: "repo" | "skip" | undefined;
  for (const a of args) {
    if (valueFor !== undefined) {
      if (valueFor === "repo") parsed.repo = a;
      valueFor = undefined;
    } else if (a === "--repo") valueFor = "repo";
    else if (VALUE_OPTIONS.has(a)) valueFor = "skip";
    else applyFlag(parsed, a);
  }
  return parsed;
}

const toTarget = (args: readonly string[], dir: string | undefined): PushTarget => {
  const { positional, all, tags, deleting, repo } = positionalArgs(args);
  // With --repo, every positional argument is a refspec.
  const [remote, ...refspecs] = repo === undefined ? positional : [repo, ...positional];
  const destinations = refspecs.map(destination);
  const named = (b: string): boolean => b !== "HEAD" && b !== "" && !isDynamic(b);
  return {
    remote,
    branches: destinations.filter(named),
    // A source that starts with "-" would be read as an option by `git log`; it is never a ref name.
    sources: refspecs.map(source).filter((r) => r !== "" && !isDynamic(r) && !r.startsWith("-")),
    // A destination or a source built by the shell (`$SHA:refs/heads/x`) could be any ref: check them all.
    // `:` and `+:` push every branch that exists on both sides (the "matching" refspec).
    allBranches:
      all ||
      destinations.some(isDynamic) ||
      refspecs.map(source).some(isDynamic) ||
      refspecs.some((r) => r.replace(/^\+/, "") === ":"),
    usesHead: destinations.includes("HEAD"),
    tagsOnly: tags && refspecs.length === 0 && !all,
    // `--tags` sends every tag as well, so a push with it deletes nothing only.
    deleteOnly:
      refspecs.length > 0 &&
      !tags &&
      (deleting || refspecs.every((r) => r.startsWith(":") && r !== ":")),
    ...(tags && refspecs.length > 0 && !all ? { withTags: true } : {}),
    ...(dir === undefined ? {} : { dir }),
  };
};

/** The remote and branches of every `git push` in a command (empty list when there is no push). */
export function pushTargets(command: string): PushTarget[] {
  const resolution = resolveGit(command);
  const targets = resolution.invocations.flatMap((g) =>
    g.sub === "push" && !isDryRun(g.args) ? [toTarget(g.args, g.dir)] : [],
  );
  // git run through something opaque (xargs, `$CMD`, an alias): a push cannot be ruled out, so assume the worst.
  const opaquePush = opaqueMentions(resolution, "push") || runsDefinedAlias(command, resolution);
  return opaquePush
    ? [
        ...targets,
        {
          remote: undefined,
          branches: [],
          sources: [],
          allBranches: true,
          usesHead: false,
          tagsOnly: false,
          deleteOnly: false,
          dir: undefined,
        },
      ]
    : targets;
}
