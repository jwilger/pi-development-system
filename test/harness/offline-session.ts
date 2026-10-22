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
) {
  const root = mkdtempSync(join(tmpdir(), "devsys-sdk-"));
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
    models: [
      {
        id: "scripted",
        name: "Scripted offline test model",
        reasoning: false,
        input: ["text"],
        contextWindow: 32000,
        maxTokens: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
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
    cwd: root,
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
    cwd: root,
    agentDir: root,
    model,
    modelRuntime: runtime,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(root),
    settingsManager: settings,
    noTools: "builtin",
    thinkingLevel: "off",
  });
  t.assert.deepEqual(extensionsResult.errors, []);
  const errors: unknown[] = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  return {
    session,
    errors,
    dispose() {
      session.dispose();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
