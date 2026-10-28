import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type ToolCall,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

/** Actual SDK session, with no user config discovery, credentials or model network calls. */
export async function offlineSession(
  t: TestContext,
  factory: ExtensionFactory,
  respond: (context: TranscriptContext, request: number) => ToolCall[],
  workingDirectory: (root: string) => string = (root) => root,
) {
  const root = mkdtempSync(join(tmpdir(), "devsys-sdk-"));
  const cwd = workingDirectory(root);
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  let cleanupSession: (() => void) | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanupSession?.();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  };
  t.after(dispose);
  const settings = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(root, "model-store.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  let requests = 0;
  runtime.registerProvider("offline-devsys", {
    api: "offline-devsys-api",
    apiKey: "not-a-real-credential",
    baseUrl: "https://offline.invalid",
    models: ["scripted", "pinned"].map((id) => ({
      id,
      name: `Offline test model ${id}`,
      reasoning: false,
      input: ["text"],
      contextWindow: 32000,
      maxTokens: 1000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
    streamSimple(requestModel, context) {
      const stream = createAssistantMessageEventStream();
      const calls = respond(context, requests++);
      const message = {
        role: "assistant" as const,
        api: requestModel.api,
        provider: requestModel.provider,
        model: requestModel.id,
        content: calls.length > 0 ? calls : [{ type: "text" as const, text: "done" }],
        stopReason: calls.length > 0 ? ("toolUse" as const) : ("stop" as const),
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        timestamp: Date.now(),
      };
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: message.stopReason, message });
      return stream;
    },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: root,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [factory],
  });
  await loader.reload();
  const model = runtime.getModel("offline-devsys", "scripted");
  t.assert.ok(model);
  const { session, extensionsResult } = await createAgentSession({
    cwd,
    agentDir: root,
    model,
    modelRuntime: runtime,
    resourceLoader: loader,
    sessionManager: SessionManager.create(root, join(root, "sessions")),
    settingsManager: settings,
    noTools: "builtin",
    thinkingLevel: "off",
  });
  cleanupSession = () => session.dispose();
  t.assert.deepEqual(extensionsResult.errors, []);
  const errors: unknown[] = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  return { session, errors, root, dispose };
}
