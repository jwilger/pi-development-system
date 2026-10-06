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

export type FakePiOptions = { hasUI?: boolean; cwd?: string };

/**
 * A minimal in-memory stand-in for pi's ExtensionAPI/ExtensionContext. It is
 * a test double only: every cast lives in this file, behind the boundary.
 */
export function createFakePi(init: FakePiOptions = {}) {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, ToolDefinition>();
  const commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
  const entries: FakeEntry[] = [];
  const sentMessages: unknown[] = [];
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
    hasUI: ui.hasUI,
    cwd: init.cwd ?? process.cwd(),
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
    sendMessage: (message: unknown) => {
      sentMessages.push(message);
    },
    sendUserMessage: (message: unknown) => {
      sentMessages.push(message);
    },
    setSessionName: () => {},
    exec: async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
  } as unknown as ExtensionAPI;

  /** Runs every handler for `event.type`; the last defined result wins. */
  async function emit(event: ExtensionEvent, overrides?: Partial<ExtensionContext>) {
    let result: unknown;
    for (const handler of handlers.get(event.type) ?? []) {
      const next = await handler(event, { ...ctx, ...overrides } as ExtensionContext);
      if (next !== undefined) result = next;
    }
    return result;
  }

  return { api, ctx, emit, tools, commands, entries, sentMessages, ui, handlers };
}

export type FakePi = ReturnType<typeof createFakePi>;
