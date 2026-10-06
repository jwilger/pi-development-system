import { gitInvocations } from "./commit-command.ts";

export type PushTarget = {
  readonly remote: string | undefined;
  /** Destination branch names named by refspecs; empty means "the current branch's default". */
  readonly branches: readonly string[];
  readonly allBranches: boolean;
};

const VALUE_OPTIONS = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);

const destination = (refspec: string): string => {
  const dst = refspec.includes(":") ? refspec.slice(refspec.lastIndexOf(":") + 1) : refspec;
  return dst.replace(/^\+/, "").replace(/^refs\/heads\//, "");
};

/** The remote and branches of every `git push` in a command (empty list when there is no push). */
export function pushTargets(command: string): PushTarget[] {
  return gitInvocations(command).flatMap((g): PushTarget[] => {
    if (g.sub !== "push") return [];
    const positional: string[] = [];
    let allBranches = false;
    for (let i = 0; i < g.args.length; i++) {
      const a = g.args[i] ?? "";
      if (VALUE_OPTIONS.has(a)) i++;
      else if (a === "--all" || a === "--mirror") allBranches = true;
      else if (!a.startsWith("-")) positional.push(a);
    }
    const [remote, ...refspecs] = positional;
    const branches = refspecs.flatMap((r) => {
      const b = destination(r);
      return b === "HEAD" || b === "" ? [] : [b];
    });
    return [{ remote, branches, allBranches }];
  });
}
