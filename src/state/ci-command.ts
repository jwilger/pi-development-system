import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Exec } from "../core/exec.ts";
import type { CiState } from "../core/types.ts";
import { watchCi } from "./ci-watch.ts";
import { loadConfig } from "./config.ts";
import type { SessionState } from "./session-state.ts";

export const CI_ENTRY_TYPE = "devsys-ci";

export type CiCommandDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  exec: Exec;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxPolls?: number;
};

const sameCi = (a: CiState | undefined, b: CiState): boolean =>
  a?.status === b.status && a?.sha === b.sha;

/** Observes trunk CI until it settles, mirroring each change into state (status line) and a `devsys-ci` entry. */
export async function runCiWatch(
  deps: CiCommandDeps,
  ctx: Pick<ExtensionCommandContext, "cwd" | "ui">,
): Promise<CiState | undefined> {
  const config = await loadConfig(ctx.cwd);
  if (!config.ok) {
    ctx.ui.notify(`cannot read the delivery policy: ${config.error.message}`, "error");
    return undefined;
  }
  const final = await watchCi({
    exec: deps.exec,
    branch: config.value.delivery.trunk,
    cwd: ctx.cwd,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    intervalMs: deps.intervalMs ?? 15_000,
    maxPolls: deps.maxPolls ?? 120,
    onObserved: (observed) => {
      if (sameCi(deps.state.get().ci, observed)) return;
      deps.state.update((s) => ({ ...s, ci: observed }));
      deps.pi.appendEntry(CI_ENTRY_TYPE, observed);
    },
  });
  ctx.ui.notify(
    `CI on ${config.value.delivery.trunk}: ${final.status}${final.sha === undefined ? "" : ` (${final.sha.slice(0, 7)})`}`,
    final.status === "red" ? "error" : "info",
  );
  return final;
}

/** `/devsys-ci`: watch the trunk's CI without blocking the session. */
export function registerCiCommand(deps: CiCommandDeps): void {
  deps.pi.registerCommand("devsys-ci", {
    description: "Watch CI on the trunk and show its state in the status line",
    handler: async (_args, ctx) => {
      ctx.ui.notify("watching CI on the trunk…", "info");
      runCiWatch(deps, ctx).catch((cause: unknown) => {
        ctx.ui.notify(
          `CI watch failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          "error",
        );
      });
    },
  });
}
