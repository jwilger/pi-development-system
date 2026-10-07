import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recommendRoute } from "../core/routing.ts";
import type { Jev } from "../jev/client.ts";
import { judgeTaskRouting } from "../jev/questions/route.ts";
import { CONFIG_FILE, loadConfig } from "./config.ts";
import { availableModels } from "./models-command.ts";

const Parameters = Type.Object({
  task: Type.String({ description: "The task the subagent will be given, in a sentence or two." }),
  files: Type.Optional(
    Type.Array(Type.String(), { description: "Files the task is expected to touch." }),
  ),
  riskSignals: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Anything that raises the stakes: auth, money, migrations, shared infrastructure.",
    }),
  ),
});

const reply = (payload: string, isError = false) => ({
  content: [{ type: "text" as const, text: payload }],
  details: undefined,
  isError,
});

/** `devsys_route_task`: Jev judges difficulty and risk; the project's routing table picks slot and effort. */
export function createRouteTaskTool(deps: {
  jev: (ctx: ExtensionContext) => Jev;
}): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_route_task",
    label: "Route task",
    description:
      "Recommend which model and thinking level a subagent should use for a task. Call before agent_spawn for implementer or reviewer work and pass the returned model and thinkingLevel.",
    promptSnippet: "Recommend model and thinking level for a subagent task",
    parameters: Parameters,
    exposure: "codemode",
    async execute(
      _id,
      params: Static<typeof Parameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      if (params.task.trim() === "") return reply("task must not be empty", true);
      const config = await loadConfig(ctx.cwd);
      if (!config.ok) return reply(`${CONFIG_FILE}: ${config.error.message}`, true);
      const judged = await judgeTaskRouting(deps.jev(ctx), {
        task: params.task,
        filesTouched: params.files ?? [],
        riskSignals: params.riskSignals ?? [],
      });
      const judgement = judged.ok
        ? { difficulty: judged.value.difficulty, risk: judged.value.risk }
        : { difficulty: "routine" as const, risk: "low" as const };
      const rec = recommendRoute({
        routing: config.value.routing,
        matrix: config.value.models,
        available: availableModels(ctx.modelRegistry),
        ...judgement,
      });
      const basis = judged.ok
        ? `Jev judged ${judgement.difficulty}/${judgement.risk}.`
        : `Jev unavailable (${judged.error.kind}); defaulted to ${judgement.difficulty}/${judgement.risk}.`;
      const spawn = {
        ...(rec.model === undefined ? {} : { model: rec.model }),
        thinkingLevel: rec.thinkingLevel,
      };
      return reply(`${basis} ${rec.note}\nPass to agent_spawn: ${JSON.stringify(spawn)}`);
    },
  };
}
