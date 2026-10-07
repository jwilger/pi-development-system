import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  RegisteredCommand,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

export type FakeUiCall = { kind: string; args: unknown[] };

export type FakeUi = {
  hasUI: boolean;
  confirmResponses: boolean[];
  selectResponses: Array<string | undefined>;
  inputResponses: Array<string | undefined>;
  calls: FakeUiCall[];
};

export type FakeEntry = { customType: string; data: unknown };

export type FakePiOptions = {
  hasUI?: boolean;
  cwd?: string;
  /** `provider/id` classifier models that exist and have configured auth. */
  classifiers?: string[];
  /** Chat models available with credentials, as `provider/id` (optionally with a price). */
  models?: { id: string; cost?: { input: number; output: number } }[];
};

/**
 * A minimal in-memory stand-in for pi's ExtensionAPI/ExtensionContext. It is
 * a test double only: every cast lives in this file, behind the boundary.
 */
// pi-lens-ignore: high-fan-out -- the fake implements the whole ExtensionAPI surface in one place, by design
export function createFakePi(init: FakePiOptions = {}) {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, ToolDefinition>();
  const commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
  const entries: FakeEntry[] = [];
  const sentMessages: unknown[] = [];
  const sendOptions: unknown[] = [];
  const ui: FakeUi = {
    hasUI: init.hasUI ?? true,
    confirmResponses: [],
    selectResponses: [],
    inputResponses: [],
    calls: [],
  };
  const record = (kind: string, args: unknown[]) => {
    ui.calls.push({ kind, args });
  };

  const ctx = {
    get hasUI() {
      return ui.hasUI;
    },
    cwd: init.cwd ?? process.cwd(),
    isProjectTrusted: () => true,
    isIdle: () => true,
    modelRegistry: {
      findOfType: (_type: string, provider: string, id: string) =>
        (init.classifiers ?? []).includes(`${provider}/${id}`)
          ? { provider, id, type: "classifier" }
          : undefined,
      hasConfiguredAuth: () => true,
      getAvailable: () =>
        (init.models ?? []).map((m) => {
          const at = m.id.indexOf("/");
          return { provider: m.id.slice(0, at), id: m.id.slice(at + 1), cost: m.cost };
        }),
      getModelsOfType: () =>
        (init.classifiers ?? []).map((c) => {
          const at = c.indexOf("/");
          return { provider: c.slice(0, at), id: c.slice(at + 1) };
        }),
      classify: async () => {
        throw new Error("fake registry: classify not configured");
      },
    },
    ui: {
      confirm: async (...args: unknown[]) => {
        record("confirm", args);
        return ui.confirmResponses.shift() ?? false;
      },
      select: async (...args: unknown[]) => {
        record("select", args);
        return ui.selectResponses.shift();
      },
      input: async (...args: unknown[]) => {
        record("input", args);
        return ui.inputResponses.shift();
      },
      setStatus: (...args: unknown[]) => record("setStatus", args),
      setWidget: (...args: unknown[]) => record("setWidget", args),
      notify: (...args: unknown[]) => record("notify", args),
    },
    sessionManager: {
      getBranch: () =>
        entries.map((e, i) => ({
          type: "custom" as const,
          customType: e.customType,
          data: e.data,
          id: String(i),
        })),
    },
  } as unknown as ExtensionContext;

  const api = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        );
      };
    },
    registerTool: (tool: ToolDefinition) => {
      tools.set(tool.name, tool);
    },
    registerCommand: (name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
      commands.set(name, options);
    },
    appendEntry: (customType: string, data: unknown) => {
      entries.push({ customType, data });
    },
    sendMessage: (message: unknown, options?: unknown) => {
      sentMessages.push(message);
      sendOptions.push(options);
    },
    sendUserMessage: (message: unknown) => {
      sentMessages.push(message);
    },
    setSessionName: () => undefined,
    exec: async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
  } as unknown as ExtensionAPI;

  /** Runs every handler for `event.type`; the last defined result wins. */
  async function emit(event: ExtensionEvent, overrides?: Partial<ExtensionContext>) {
    let result: unknown;
    const effective = { ...ctx, ...overrides };
    for (const handler of handlers.get(event.type) ?? []) {
      const next = await handler(event, effective as ExtensionContext);
      if (next !== undefined) result = next;
    }
    return result;
  }

  /**
   * A stand-in for `ctx.executeTool()` as a codemode script sees it: every nested call is
   * announced to `tool_call` handlers, then (unless blocked) run by `run`, then reported to
   * `tool_result` handlers. Ids are `<parent>/<n>` and events carry `parentToolCallId`, as in pi.
   */
  function nestedExecutor(parentId: string, run: NestedRunner): NestedExecute {
    let count = 0;
    return async (toolName, input) => {
      count += 1;
      const toolCallId = `${parentId}/${count}`;
      const base = { toolName, toolCallId, parentToolCallId: parentId, input };
      const verdict = (await emit({ type: "tool_call", ...base } as never)) as
        | { block?: boolean; reason?: string }
        | undefined;
      const blocked = verdict?.block === true;
      const out = blocked
        ? { text: verdict?.reason ?? "blocked", isError: true }
        : await run(toolName, input);
      await emit({
        type: "tool_result",
        ...base,
        content: [{ type: "text", text: out.text }],
        isError: out.isError,
        details: undefined,
      } as never);
      return { blocked, reason: verdict?.reason, ...out };
    };
  }

  return {
    api,
    ctx,
    emit,
    nestedExecutor,
    tools,
    commands,
    entries,
    sentMessages,
    sendOptions,
    ui,
    handlers,
  };
}

export type NestedRunner = (
  toolName: string,
  input: Record<string, unknown>,
) => { text: string; isError: boolean } | Promise<{ text: string; isError: boolean }>;
export type NestedExecute = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<{ blocked: boolean; reason: string | undefined; text: string; isError: boolean }>;

export type FakePi = ReturnType<typeof createFakePi>;
