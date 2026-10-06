# 04 — What a pi extension package can do (pi 1.0.4)

Research report, read-only survey of the locally installed pi 1.0.4 docs, type declarations, bundled examples, and the packages already installed on this machine. Purpose: ground the design of `@jwilger/pi-development-system` (skills + rules + workflow enforcement + decision capture) in mechanisms pi actually provides.

Path abbreviations used below:

- `$D` = `/home/jwilger/.pi/agent/install/releases/1.0.4/node_modules/@earendil-works/pi-coding-agent`
- `$E` = `$D/examples/extensions`
- `$T` = `$D/dist/core/extensions/types.d.ts` (the authoritative API surface; 1721 lines)
- `$N` = `/home/jwilger/.pi/agent/npm/node_modules` (where `pi install npm:...` packages live)

Evidence labels: **[doc]** = documented intent in `$D/docs/*.md`; **[type]** = declared in `.d.ts`; **[example]** = behavior shown by a bundled example; **[observed]** = read from this machine's installed state; **[inference]** = my conclusion.

---

## 1. Package anatomy

### 1.1 package.json

- Minimal npm package: `"type": "module"`, `keywords: ["pi-package"]` (gallery discovery), `files` whitelist, and host libraries as **peerDependencies with `"*"`** — never in `dependencies`, never bundled: `@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `typebox`. Pi suppresses automatic peer installation for managed npm/git packages; bundling them produces duplicate-class warnings. [doc `$D/docs/packages.md:88`]
- Runtime deps (yaml, zod, etc.) go in `dependencies`; pi installs them for npm/git sources into a shared flat `$N` (observed: express, jiti, yaml, zod present). Local (`./path`) packages are not installed/modified; their deps are the author's problem. [doc packages.md; observed `$N`]
- Optional `"pi"` manifest with globs relative to the package root: `{"extensions": [...], "skills": [...], "prompts": [...], "themes": [...], "image": ..., "video": ...}`. Without it pi auto-discovers the conventional directories `extensions/`, `skills/`, `prompts/`, `themes/`. [doc packages.md]
- Conventions seen in installed packages [observed]:
  - `pi-goal-x@0.32.3`: `"pi": {"extensions": ["extensions/goal.ts"]}`, ships raw `.ts`, no build step, `files` whitelist, plus a `bin` script.
  - `pi-subagent-manager@0.14.0`: `"pi": {"extensions": ["./src/index.ts"]}`, `engines.node >= 22.19.0`, `peerDependencies["@earendil-works/pi-coding-agent"] = ">=0.99.2"` (a **minimum host version pin** — the only package here that does it), others `"*"`.
  - `pi-lens@4.3.0`: compiled `"pi": {"extensions": ["./dist/index.js"], "skills": ["./skills"]}`.
- Our scaffold (`/home/jwilger/src/pi-development-system/package.json`, working tree) already has: name `@jwilger/pi-development-system`, `keywords: ["pi-package"]`, `type: module`, `files: [extensions, skills, prompts, themes]`, `peerDependencies: {"@earendil-works/pi-coding-agent": "*"}`. Missing vs. best practice: the other four peer deps, and a `"pi"` manifest (optional while dirs are conventional).

### 1.2 Directories and discovery

- `extensions/`: each direct `.ts`/`.js` child, or a subdirectory with `index.ts`, is one extension. Loaded via **jiti** — TypeScript runs without a compile step. [doc `$D/docs/extensions.md`]
- `skills/`: discovered **recursively**; a skill is a directory containing `SKILL.md`. [doc `$D/docs/skills.md`]
- `prompts/`: **direct `.md` children only** (no recursion) → each becomes `/filename`. [doc `$D/docs/prompt-templates.md`]
- `themes/`: `.json` theme files. [doc `$D/docs/themes.md`]
- Extensions can also register resources programmatically: `pi.on("resources_discover", () => ({ skillPaths, promptPaths, themePaths }))`, fired with `{cwd, reason: "startup"|"reload"}`. [type `$T`; example `$E/dynamic-resources/index.ts`, which uses `dirname(fileURLToPath(import.meta.url))` as base]. This is how to ship skills whose set depends on project detection.

### 1.3 Skills (Agent Skills spec)

- `SKILL.md` frontmatter: `name` (lowercase/digits/hyphens, ≤64), `description` (≤1024, **required**; no description → not loaded), `license`, `compatibility`, `metadata`, `allowed-tools` (experimental), `disable-model-invocation`. Pi implements the agentskills.io spec. [doc skills.md]
- Loading is **lazy**: at startup only `name + description + path` go into the system prompt; the model `read`s SKILL.md on demand. `/skill:name [args]` force-loads it (args appended as the user request). Setting `enableSkillCommands` controls whether those commands exist. Relative paths inside the skill dir (scripts/, references/, assets/) work. [doc skills.md]
- Discovery roots: `~/.pi/agent/skills/`, `.pi/skills/`, `~/.agents/skills/`, `.agents/skills/`, plus packages. Project discovery walks ancestors to the repo root. Name collision: first wins with a warning. [doc skills.md]
- Implication for Sonnet: the skill description is the *only* thing the model sees without an explicit read. Descriptions must say *when* to load the skill, and an extension can force-load via `pi.sendUserMessage("/skill:name", {deliverAs: "followUp"})` or by injecting the skill body itself. [inference from skills.md + `$E/reload-runtime.ts` pattern]

### 1.4 Prompt templates

- `prompts/foo.md` → `/foo`. Frontmatter `description`, `argument-hint`. Substitutions `$1..$N`, `$@`/`$ARGUMENTS`, `${1:-default}`, `${@:-default}`, `${@:N}`, `${@:N:L}`, shell-like quoting. Extensions see the raw text via the `input` event first, unless an extension command of the same name handles it. [doc prompt-templates.md; example `$E/subagent/prompts/implement-and-review.md`]

### 1.5 Install / update / reload

- `pi install npm:@scope/pkg[@1.0.0] | git:github.com/x/y[@ref] | ./local`; `pi list`; `pi remove <source>`; `pi -e npm:pkg` one-shot trial. Personal installs write `~/.pi/agent/settings.json`; `--local/-l` writes `.pi/settings.json` (read only after project trust). [doc packages.md]
- Pinning: a versioned npm spec or git tag/commit is pinned and `pi update` does **not** move it. Unversioned (`npm:pkg`) follows latest. [doc packages.md]
- `pi update --extensions` updates all installed packages; `pi update <source>` one; `pi update --all` pi + packages; `pi update` alone updates pi itself (not when nix provides pi). [doc `$D/docs/cli.md:271-289`]
- Settings object form lets a user filter a package: `{"source": "npm:...", "extensions": ["x/*.ts", "!x/legacy.ts"], "skills": [...]}`; `!pattern` exclude, `+path` include, `-path` remove. A project entry for the same package replaces the personal one unless `autoload: false`. Identity: npm by name, git by URL sans ref, local by absolute path. [doc packages.md, settings.md]
- Reload in-session: `/reload` command, or from an extension **command handler only**: `await ctx.reload()` (`ExtensionCommandContext`). A tool cannot reload directly; the workaround is `pi.sendUserMessage("/reload-runtime", {deliverAs: "followUp"})`. [example `$E/reload-runtime.ts`; type `$T`]
- Development: `pi --extension ./x.ts` loads a file without installing. [doc extensions.md]

---

## 2. Extension API

### 2.1 Shape

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) { /* register */ }
```
Factory may be async. Do **not** start timers/processes in the factory (some invocations load extensions without a session); start in `session_start`, clean up in an idempotent `session_shutdown`. Handlers run in load + registration order. A thrown error inside a `tool_call` handler **blocks the tool** (fail-safe). [doc extensions.md]

### 2.2 Events (`pi.on(name, handler)`) — complete list from `$T`

| Event | Payload (key fields) | Return / effect |
|---|---|---|
| `project_trust` | trust decision | only personal/CLI extensions receive it |
| `resources_discover` | `{cwd, reason}` | `{skillPaths?, promptPaths?, themePaths?}` |
| `session_start` | `{reason: "startup"\|"reload"\|"new"\|"resume"\|"fork", previousSessionFile?}` | rebuild state here (`$T:555-561`) |
| `session_info_changed` | `{name}` | notification |
| `session_before_switch` / `session_before_fork` | reason | `{cancel: true}` blocks (`$E/dirty-repo-guard.ts`) |
| `session_before_compact` | `{preparation, branchEntries, customInstructions?, reason: "manual"\|"threshold"\|"overflow", willRetry, signal}` | `{cancel: true}` or `{compaction: {summary, firstKeptEntryId, tokensBefore, usage?, details?}}` |
| `session_compact` | `{compactionEntry, fromExtension, reason, willRetry}` (`$T:593-601`) | notification; place to arm a post-compaction reminder |
| `session_compact_failed` | `{reason, errorMessage, aborted, willRetry, fromExtension}` | notification |
| `session_before_tree` / `session_tree` | branch-navigation preparation | `{cancel}` or `{summary}` |
| `session_shutdown` | `{reason}` | cleanup |
| `mcp_servers_change` | | notification |
| `context` | `{messages}` (no system msgs) | `{messages?}` — request-local transform, not persisted |
| `context_with_system` | full transcript | must keep system message at index 0 |
| `cache_warming_decision`, `before_provider_request` (`{payload}` → replacement), `before_provider_headers`, `after_provider_response`, `provider_stream_event` (read-only) | provider wire level | |
| `before_agent_start` | `{prompt, images?, readonly systemPrompt, systemPromptOptions (mutable)}` | `{message?: {customType, content, display, details?}, systemPrompt?}` |
| `agent_start` / `agent_end` (`{messages}`) | | notification |
| `turn_start` | `{turnIndex, timestamp}` | |
| `turn_end` | `{turnIndex, message, toolResults, messageEntryId, toolResultEntryIds, entries, continue, context: BoundaryContextPreview, outcome: "completed"\|"aborted"\|"error"}` | `{entries?: SessionBoundaryDraft[], continue?: boolean}` |
| `agent_before_settle` | `BoundaryState` (`$T:755-768`) | `{entries?, continue?}` — last chance to append entries and force **one** more model request |
| `agent_settled` | | notification only, nothing further will run |
| `message_start` / `message_update` / `message_end` | message | `message_end` may return `{message}` replacement, same role |
| `tool_execution_start/update/end` | | notification |
| `tool_call` | typed union: bash/powershell/read/edit/write/grep/find/ls/custom (`$T:896-949`); `event.input` is mutable; `toolCallId`, `parentToolCallId?` for nested/codemode calls | `{block?, reason?, terminate?}` (`$T:1054-1063`) |
| `tool_result` | `{toolName, input, content, structuredContent?, isError, details, usage?}` | `{content?, details?, structuredContent?, isError?, usage?}`; handlers compose |
| `model_select` | `{model, previousModel, source: "set"\|"cycle"\|"restore"}` | notification (`$E/model-status.ts`) |
| `thinking_level_select` | `{level, previousLevel}` | |
| `user_bash` | user `!cmd` | custom operations |
| `input` | `{text, images?, source: "interactive"\|"rpc"\|"extension"}` | `{action: "continue"}` \| `{action: "transform", text}` \| `{action: "handled"}` |
| `ui_prompt_start/end` | | |

Use `isToolCallEventType("bash", event)` to narrow, because `CustomToolCallEvent.toolName` is `string` (`$T:1014-1038`).

`SessionBoundaryDraft` (what `turn_end`/`agent_before_settle` may return) = `{type: "custom", customType, data?}` | `{type: "custom_message", customType, content, display, details?}` | `{type: "context_edit", targetId, replacement}` | `{type: "compaction", summary, firstKeptEntryId|null, details?, usage?}`. [type `$T`]

### 2.3 System prompt contributions

`before_agent_start` exposes `systemPromptOptions: NormalizedBuildSystemPromptOptions` with all collections present and mutable (`$D/dist/core/system-prompt.d.ts:37-50`): `selectedTools`, `hiddenTools`, `toolSnippets`, `toolGuidelines: Record<string,string[]>`, `promptGuidelines: string[]`, `appendSystemPrompt`, `sections: Record<string,string>`, `contextFiles`, `skills`.

- `sections`: "`preamble` is untagged text; every other section is wrapped in a tag of the same name so the model can match later updates to it. These become `SystemMessage.sections` in the transcript." (`system-prompt.d.ts:51-56`). `diffSystemPromptSections()` emits a patch; pi records the full prompt in the first system message and later **patches by section name** (null removes). [doc `$D/docs/session-format.md`]
- Docs: "Prefer changing prompt sections, selected tools, or guidelines so Pi can append a transcript delta. Returning `systemPrompt`, or setting `forceSystemPrompt`, replaces the whole prompt for that run while the transcript continues recording the structured sections." [doc `$D/docs/extensions.md:103`] `$E/claude-rules.ts` shows the older whole-replacement style (`{systemPrompt: event.systemPrompt + "..."}`); prefer `systemPromptOptions.sections["dev-system"] = "..."`.
- Static alternatives: `~/.pi/agent/APPEND_SYSTEM.md` / `.pi/APPEND_SYSTEM.md` (appends), `SYSTEM.md` (replaces default). Trusted project file wins over agent-dir same-name file. Context files AGENTS.md/CLAUDE.md/AGENTS.override.md discovered from agent dir + cwd ancestors. [doc `$D/docs/configuration.md`]
- Tools contribute `promptSnippet` and `promptGuidelines` on `ToolDefinition`, which pi inserts in the tool section. [type `$T`]

### 2.4 Tools

```ts
import { Type } from "typebox";                 // peer dep
import { StringEnum } from "@earendil-works/pi-ai";
pi.registerTool({
  name: "record_decision", label: "Record decision",
  description: "...", promptSnippet?: "...", promptGuidelines?: ["..."],
  parameters: Type.Object({ kind: StringEnum(["departure","choice"] as const), rationale: Type.String() }),
  outputSchema?, exposure?: "direct"|"model-only"|"codemode"|"deferred"|"hidden",
  annotations?: { readOnlyHint, destructiveHint, idempotentHint, openWorldHint },
  defaultActive?: boolean, executionMode?: "sequential"|"parallel",
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return { content: [{type:"text", text:"recorded"}], details: {...} };   // throw for error
  },
  renderCall?, renderResult?,
});
```
[type `$T` ToolDefinition; example `$E/todo.ts`, `$E/questionnaire.ts`]. Tools cannot be unregistered — re-register with `exposure: "hidden"` to withdraw. `ctx.executeTool(name, args, {signal, onUpdate})` calls another tool; it never rejects (`isError` on failure) and the nested call passes through `tool_call`/`tool_result` hooks with id `<parent>/<n>`. `pi.getActiveTools()/setActiveTools([...])/getAllTools()`; pi records tool-set changes as `toolsAdded/toolsRemoved` on system messages. `prepareLoadout(loadout) → {descriptions, hiddenDeclarations}` lets a tool adjust its declaration per request. [doc extensions.md; type `$T`]

### 2.5 Commands, shortcuts, flags

- `pi.registerCommand("name", {description?, getArgumentCompletions?, handler(args, ctx: ExtensionCommandContext)})`. Command-only operations: `ctx.waitForIdle()`, `ctx.reload()`, `ctx.newSession({parentSession?, setup?, withSession?})`, `ctx.fork(entryId, {...})`, `ctx.navigateTree(targetId, {summarize, customInstructions, replaceInstructions, label})`, `ctx.switchSession(path)`, `ctx.getSystemPromptOptions()`. Calling these from lifecycle handlers risks deadlock. [type `$T`; doc extensions.md]
- `pi.registerShortcut(Key.ctrlAlt("p"), {description, handler})` (`Key` from `@earendil-works/pi-tui`). `pi.registerFlag("plan", {type: "boolean"|"string", default})` → `pi.getFlag("plan")` exposes a CLI flag. [example `$E/plan-mode/index.ts`]

### 2.6 Persistent state — three tiers

Per `$D/docs/extensions.md` state table and `$D/docs/session-format.md`:

| Need | Mechanism | In model context? | Survives compaction? |
|---|---|---|---|
| Tool-scoped state | tool result `details` (reconstruct by scanning `ctx.sessionManager.getBranch()` for `role === "toolResult" && toolName === X`) | details: no | entry stays in JSONL; content before cut point leaves context |
| Durable, not for the model | `pi.appendEntry(customType, data)` → `{type: "custom"}` entry; render with `pi.registerEntryRenderer` | **No** | Yes (JSONL; must be re-read in `session_start`) |
| Content the model should see | `pi.sendMessage({customType, content, display, details}, {triggerTurn?, deliverAs?: "steer"\|"followUp"\|"nextTurn"})` → `{type: "custom_message"}` converted to a user message; `details` not sent | **Yes** | Entry persists, but once before `firstKeptEntryId` it is replaced by the summary |
| Ephemeral per-request | `context` hook returns modified `messages` | Yes for that request | Not persisted at all |
| Hide/replace an existing message | `context_edit` draft from `turn_end` (`{targetId, replacement|null}`) | affects context | append-only, latest wins, branch-relative |

Restore pattern (`$E/plan-mode/index.ts`): in `session_start` and `session_tree`, `ctx.sessionManager.getEntries().filter(e => e.type === "custom" && e.customType === "plan-mode").pop()`. Use `getBranch()` not `getEntries()` when abandoned branches matter (`$E/todo.ts` `reconstructState`). pi itself stores virtual-model state as customType `pi.virtual-model-state`, and codemode `store()/load()` as `codemode-store` entries — precedent for extension-owned durable state. [doc session-format.md, codemode.md]

Other entry types in the JSONL (`version: 3`): `message`, `model_change {provider, modelId}`, `thinking_level_change`, `usage`, `compaction`, `context_edit`, `branch_summary`, `custom`, `custom_message`, `label`, `session_info`. [doc session-format.md] `pi.setLabel(entryId, label)`, `pi.setSessionName()`. Session file path is in `PI_SESSION_FILE` for child processes. [doc `$D/docs/environment-variables.md`]

### 2.7 UI (`ctx.ui`, type `ExtensionUIContext`)

- Blocking prompts: `select(title, options[], {signal?, timeout?})`, `confirm(title, message, opts?) → boolean`, `input(title, placeholder?)`, `editor(title, prefill?)`, `custom<T>(factory, {overlay, overlayOptions, onHandle})`. `notify(msg, "info"|"warning"|"error")`.
- Persistent chrome: `setStatus(key, text|undefined)` (status line), `setWidget(key, string[]|factory|undefined, {placement: "aboveEditor"|"belowEditor"})`, `setFooter/setHeader(factory)`, `setTitle`, `setWorkingMessage`, `setEditorText/getEditorText`, `addAutocompleteProvider`, `setEditorComponent`, `theme.fg(token, text)`, `theme.strikethrough()`.
- Gating: `ctx.hasUI` is true in tui **and** rpc (dialogs work); `ctx.mode === "tui"` required for custom components; `json`/`print` modes have no UI — guards must **block by default** when `!ctx.hasUI` (`$E/permission-gate.ts`). [type `$T`; doc extensions.md, `$D/docs/tui.md`, `$D/docs/rpc-extension-ui.md`]
- `pi.registerMessageRenderer(customType, (message, options, theme) => Component)` and `registerEntryRenderer` control how custom messages/entries display; `registerToolRenderer`, `registerMarkdownTransformer`.

### 2.8 Compaction hooks (summary; details in §4)

`session_before_compact` → either cancel, or return your own `{compaction}` built with `convertToLlm` + `serializeConversation` from `@earendil-works/pi-coding-agent` and `ctx.modelRegistry.complete(model, {messages}, {maxTokens, signal, cacheRetention, sessionId})` (`$E/custom-compaction.ts`). Returning `undefined` falls through to default. `session_compact` fires afterwards with the `compactionEntry`. `ctx.compact({customInstructions?, onComplete?, onError?})` triggers compaction programmatically (`$E/trigger-compact.ts`). `ctx.getContextUsage() → {tokens|null, contextWindow, percent|null}`.

### 2.9 Models, subagents, settings

- Model: `ctx.model`, `ctx.modelRegistry.find(provider, id)`, `pi.setModel(model) → Promise<boolean>`, `get/setThinkingLevel`, `model_select` event (source `"restore"` on resume), `ctx.scopedModels`. `pi.registerVirtualModel({provider, id, name, thinkingLevels, route(request, ctx) → {model, thinkingLevel}})` lets an extension define a model that routes per request. [doc `$D/docs/virtual-models.md`]
- Subagents: no first-class API. `$E/subagent/index.ts` spawns `pi --mode json -p --no-session --model X --thinking Y --tools a,b --append-system-prompt <tmpfile> "<task>"` via `pi.exec`/child_process, with agent definitions as `.md` + frontmatter (`name/description/tools/model`) in `~/.pi/agent/agents/` or `.pi/agents/`, parsed with `parseFrontmatter` from `@earendil-works/pi-coding-agent`. `pi-subagent-manager` (installed) does the same in-process with resumable threads. Child processes see `AI_AGENT=pi`, `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_MODEL`, etc. [example; doc environment-variables.md]
- Settings: `pi.getSettings()` returns the merged `Settings` (agent dir + project; project overrides scalars, resource lists combine). Relevant keys: `defaultTools`, `compaction.{enabled, reserveTokens=16384, keepRecentTokens=20000, modelOverrides}`, `steeringMode/followUpMode`, `enableSkillCommands`, `codemode.mode`. [doc `$D/docs/settings.md`, compaction.md]
- `pi.exec(cmd, args, opts) → ExecResult {stdout, stderr, code}` for deterministic checks (`$E/dirty-repo-guard.ts` runs `git status --porcelain`). `pi.events: EventBus` for inter-extension messaging (`$E/event-bus.ts`). `pi.registerMcpServer(name, config)` (not persisted).

### 2.10 Resource precedence

Agent dir (`~/.pi/agent`, overridable via `PI_CODING_AGENT_DIR`) then project `.pi/` (after trust). Settings: project scalars override; `packages/extensions/skills/prompts/themes` lists combine with `!`/`+`/`-` filters. Trusted project `SYSTEM.md`/`APPEND_SYSTEM.md` replace (not combine with) the agent-dir file. Built-ins `builtin:mcp`, `builtin:codemode`, `builtin:tool-search`, `builtin:llama.cpp` are disabled with `-builtin:x`. Handlers run in load order, so a project extension's `tool_call` guard runs after a global one. [doc configuration.md, settings.md, extensions.md]

---

## 3. Patterns for ENFORCEMENT

### 3.1 Block / intercept tool calls

```ts
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event) && /\bgit\s+commit\b/.test(event.input.command)) {
    const ok = await preconditionsMet(ctx);           // deterministic, see 3.5
    if (!ok) return { block: true, reason: "Commit blocked: ADR/decision log missing for departure X. Run `record_decision` first." };
  }
  if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
    if (event.input.path.startsWith("docs/adr/") && !state.adrPhaseOpen) return { block: true, reason: "..." };
  }
});
```
- The `reason` string is what the model receives as the tool result — write it as an instruction (what to do instead). [doc extensions.md; example `$E/permission-gate.ts`, `$E/protected-paths.ts`]
- `event.input` may be mutated in place (e.g. rewrite `git commit` to add `--no-verify`-free flags, or prefix commands).
- `terminate: true` hints the agent to stop after the batch when **every** blocked result in the batch sets it (`$T:1058-1062`).
- Pattern lists for safe/destructive bash in `$E/plan-mode/utils.ts`: `DESTRUCTIVE_PATTERNS` includes `/\bgit\s+(add|commit|push|…)/i` and shell redirects `/(^|[^<])>(?!>)/`; `SAFE_PATTERNS` allowlists `git status|log|diff|show|branch|remote|config --get`.
- Codemode scripts route each `tools.x()` call through `tool_call` (ids `<parent>/<n>`), so guards hold there too. [doc codemode.md; `$T:896-905`]
- Coarser control: `pi.setActiveTools([...])` to remove `edit/write/bash` during a planning phase, restoring afterwards (`$E/plan-mode/index.ts` saves `toolsBeforePlanMode`).
- Precedent on this machine: `pi-lens` has a read-guard (blocks edits to files not previously read) and a git-guard (holds `commit/push` while findings are unresolved) [observed README]; `pi-goal-x` blocks work tools after its stop tool fires (`$N/pi-goal-x/extensions/goal-events.ts:106`).

### 3.2 Interactive judgement at decision points

- From inside a guard: `const choice = await ctx.ui.select("Departure from recommended approach", ["Record rationale and proceed", "Follow recommendation", "Abort"])`; `ctx.ui.editor("Rationale", draft)`. Block if `!ctx.hasUI`. [example `$E/permission-gate.ts`, `$E/handoff.ts`]
- Model-side: a tool like `record_decision` that opens `ctx.ui.custom<QuestionnaireResult>(...)` for the human when a departure is detected (`$E/questionnaire.ts`, `$E/question.ts`), or simply persists when no human is needed.
- Timed/auto-default confirmations: `ctx.ui.confirm(title, msg, {timeout})` (`$E/timed-confirm.ts`).

### 3.3 Per-turn reminders

Three delivery channels, by durability:

1. **System prompt section** — `before_agent_start`: `event.systemPromptOptions.sections["dev-system-rules"] = text; event.systemPromptOptions.promptGuidelines.push("...")`. Transcript-recorded as a section delta, cache-friendly when stable. [doc extensions.md:103; type system-prompt.d.ts]
2. **Hidden custom message per run** — `before_agent_start` returns `{message: {customType: "dev-system-context", content: "[PHASE: implement] …", display: false}}`; combine with a `context` handler that drops stale copies: `event.messages.filter(m => (m as any).customType !== "dev-system-context")` so only the newest lives in context (`$E/plan-mode/index.ts`). These are persisted `custom_message` entries.
3. **Ephemeral tail injection** — `context` hook appends state blocks that are never written to the session. `pi-goal-x` does this (`goal-events.ts:74-90`) with a "live retention" scheme that keeps previously-sent tails verbatim so the prompt cache prefix is preserved and only new state is appended. Cheapest for high-churn state (counters, phase), invisible in `/export`.

Between turns inside one agent run: `turn_end` may return `entries` (a `custom_message` draft) and `continue: true` to force one more model request — e.g. "you edited 3 files without running tests; run them now". Guard against loops (`$T:755-768`; doc extensions.md). After the run: `agent_end` can prompt the user and `pi.sendMessage(..., {triggerTurn: true, deliverAs: "followUp"})`.

### 3.4 Decision log in the session

- Persist each decision as `pi.appendEntry("dev-system.decision", {id, ts, kind: "departure"|"choice", recommended, chosen, rationale, files, commit?})` → not in model context, survives compaction, rebuildable in `session_start` via `getBranch()`. Render with `registerEntryRenderer` so it's visible in the transcript. Mirror a digest into the system prompt section or ephemeral tail (3.3) so the model keeps seeing it. Mirror to disk (`docs/decisions/*.md` or ADR) for cross-session durability — session entries are per-session; pi-goal-x keeps goal state in `.pi/goals/*.md` + a per-goal JSONL ledger for exactly this reason. [doc session-format.md; observed pi-goal-x]
- `pi.setLabel(entryId, "DECISION: use X over Y")` labels the transcript entry for `/tree` navigation.

### 3.5 Deterministic checks

- `pi.exec("git", ["status", "--porcelain"])`, `pi.exec("npm", ["test"])`, lint, ADR-file presence checks — all from `tool_call` (synchronous gate) or `turn_end` (post-hoc). `ExecResult {stdout, stderr, code}`. [example `$E/dirty-repo-guard.ts`, `$E/auto-commit-on-exit.ts`]
- `tool_result` can rewrite `content` (e.g. append "Tests not run since last edit" to an `edit` result) or set `isError`.
- Use `annotations.destructiveHint` on own tools to let other guards reason generically (hints are unverified).

### 3.6 Detect model change

`pi.on("model_select", ({model, previousModel, source}, ctx) => …)` — `source` is `"set" | "cycle" | "restore"`; `model.provider`/`model.id`; also `ctx.model` at any time and the `model_change` JSONL entry. Use it to swap the rule set (e.g. tighter guardrails and more explicit checklists when `model.id` matches `/sonnet/`) by mutating sections in the next `before_agent_start`. [example `$E/model-status.ts`; type `$T`]

---

## 4. Patterns for ANTI-DRIFT

### 4.1 What compaction does (so you know what disappears)

- Triggers when `contextTokens > contextWindow − reserveTokens` (16384) between turns, before a prompt, or on overflow (one compact-and-retry). Cut point is a user/assistant/bashExecution/custom_message/branch_summary boundary, never a tool result; `keepRecentTokens` (20000) retained. Appends `CompactionEntry {summary, firstKeptEntryId, tokensBefore, systemMessage? (checkpoint of prompt+tools), details?, fromHook?}`. Context afterwards = system checkpoint + summary message + entries from `firstKeptEntryId`. Original entries remain in the JSONL tree. [doc `$D/docs/compaction.md`, session-format.md]
- Default summary skeleton: `## Goal / ## Constraints & Preferences / ## Progress (Done/In Progress/Blocked) / ## Key Decisions / ## Next Steps / ## Critical Context` + `<read-files>/<modified-files>`; tool results truncated to 2000 chars in `serializeConversation()`. [doc compaction.md]
- **Everything before the cut point — including your `custom_message` reminders — is gone from context unless the summarizer kept it.** `custom` entries are never in context anyway, so they are unaffected. [doc session-format.md; inference]

### 4.2 Mechanisms that survive or re-inject

1. **System prompt sections** survive by construction: the compaction entry stores a system checkpoint and the structured prompt is rebuilt each run from `before_agent_start`. Put the invariant rules, current phase, and decision digest there. [doc session-format.md; system-prompt.d.ts]
2. **Own the summary**: `session_before_compact` → compute your own `summary` (optionally with a cheaper model via `ctx.modelRegistry.complete`) that *always* includes a fixed "Development-system state" block generated from your `custom` entries rather than from the model's memory; or let default run and pass `customInstructions` via `ctx.compact({customInstructions})`. `event.preparation.previousSummary` is available for iterative merging. [example `$E/custom-compaction.ts`; doc compaction.md]
3. **Post-compaction resync**: in `session_compact` set a flag; on the next `before_agent_start`/`context` inject a delta like pi-goal-x's `[POST-COMPACTION RESYNC goalId=…] The conversation was just compacted. Re-read the objective and continue from the actual artifacts/state; do not rely on memory of the prior chat.` (`$N/pi-goal-x/extensions/goal-events.ts:~480`). The `willRetry` flag tells you if the aborted turn is being retried.
4. **Durable `custom` entries + disk**: decision log, phase, checklist state as `appendEntry` and/or files in `.pi/` or `docs/`. Rebuild in `session_start` (`reason` tells you startup/resume/fork/new) and `session_tree`.
5. **Ephemeral `context` tail** (3.3 #3) — regenerated every request from durable state, so compaction cannot lose it.
6. **Branch navigation**: `session_before_tree` can supply its own branch summary; `navigateTree(targetId, {summarize, customInstructions})`. [doc compaction.md]
7. **Handoff instead of compaction**: `$E/handoff.ts` builds a fresh session with a model-written handoff prompt via `ctx.newSession({...})` — a deliberate reset with a structured brief.

### 4.3 Context hygiene

- `context` hook can prune noise (stale reminders, superseded state blocks) each request; `context_edit` drafts can permanently omit/replace messages (e.g. collapse a long failed-attempt transcript into a one-line note).
- `ctx.getContextUsage().percent` lets a status widget show pressure and the extension pre-emptively `ctx.compact()` at a phase boundary (clean cut, better summary) rather than mid-task (`$E/trigger-compact.ts`).

---

## 5. What is installed here; how pi-goal-x consumes a plan

### 5.1 Installed state [observed]

`~/.pi/agent/settings.json`: `defaultProvider "openai-codex"`, `defaultModel "gpt-6-sol"`, `steeringMode "all"`, `defaultProjectTrust "ask"`; `packages`: `npm:pi-goal-x`, `npm:pi-subagent-manager`, `npm:billion-context`, `npm:pi-web-access`, `npm:@juicesharp/rpiv-ask-user-question`, `npm:pi-lens`, `npm:@jwilger/pi-development-system` (all **unpinned**); `extensions`: `/home/jwilger/.hindsight/coding-agents/dist/pi.js`, `+builtin:mcp`; `skills`: `-/home/jwilger/.agents/skills/hindsight-coding-agent`. `~/.pi/agent/extensions/` holds only `pi-better-openai.json`. Installed copy of our package at `$N/@jwilger/pi-development-system` is the empty 0.0.0 scaffold.

- **pi-goal-x 0.32.3** — goal/plan tracking; 45 modules; tools `create_goal/get_goal/update_goal/set_goal_tasks/update_goal_task` + drafting `goal_question/goal_questionnaire/propose_goal_draft`; commands `/goal-*`; separate-process auditor. Hooks nearly every event (context, before_provider_request, tool_call, turn_end, session_before_compact, session_compact, session_tree, before_agent_start, agent_end, agent_settled…).
- **pi-subagent-manager 0.14.0** — in-process subagents with resumable threads; agents `architect, coder, researcher, reviewer, tasker, writer` as `agents/*.md` with frontmatter `name, icon, description, thinkingLevel, color, modelSuggestions[], tools.allow[]`; tools `agent_update/agent_pause`. `coder.md` already encodes "write down files, behavior change, and the disproving check before editing" — overlaps with our workflow intent.
- **pi-lens 4.3.0** — AST-grep/LSP skills + read-guard + git-guard.
- **billion-context, pi-web-access, @juicesharp/rpiv-ask-user-question** — context management, web, structured ask-user tool.
- **hindsight** — memory extension loaded by path.

### 5.2 pi-goal-x plan file format [observed, `$N/pi-goal-x/extensions/storage/goal-files.ts`]

- Location: `.pi/goals/active_goal_<timestamp>_<id>.md`; archived in `.pi/goals/archived/`; locks `.pi/goals/.locks/<goalId>.lock`; `.pi/goals/.metadata`; pool snapshot `.goals-pool-snapshot.json`; per-goal JSONL ledger.
- `serializeGoalFile` (`goal-files.ts:334`): file begins with a **JSON object** `{"version": 3, ...GoalRecord}` followed by markdown:
  ```
  # Goal Prompt
  <objective text>
  ## Progress
  Status: … | Auto-continue: … | Sisyphus mode: … | Time spent: … | Tokens used: … | Verification contract: …
  ## Tasks
  <!-- blockCompletion: true|false -->
  - [x| |~] <taskId>: <title> — evidence: …; skipped: …; contract: …
  ```
- `parseGoalFile` (`goal-files.ts:414`) reads the JSON head via `findJsonObjectEnd`, then the objective between `# Goal Prompt` and `## Progress`. The JSON record is authoritative; the markdown is a human-readable projection. There is **no documented external "plan file" contract** — a third party would have to write this exact JSON+markdown shape or use the `create_goal`/`set_goal_tasks` tools. Focus is branch-local via `pi.appendEntry("pi-goal-focus", {version: 1, focusedGoalId, reason})`.
- Implication: integrate with pi-goal-x **through its tools** (model calls `create_goal`/`set_goal_tasks`) or not at all; do not write its files directly. [inference]

---

## 6. Constraints and gotchas

- **TypeScript/ESM**: extensions run under jiti; raw `.ts` ships fine (pi-goal-x, pi-web-access do it) or precompile to `dist/*.js` (pi-lens). `"type": "module"` required. Our tsconfig uses `module: nodenext`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit` — compatible with the raw-`.ts` route, but `include` currently covers only `scripts` and `test`; add `extensions` for typechecking.
- **Peer deps**: all five host packages in `peerDependencies: "*"`; never import a bundled copy. Only `@earendil-works/pi-coding-agent` is declared in our scaffold today.
- **Version pinning**: users who install `npm:@jwilger/pi-development-system` unpinned get every publish on `pi update --extensions`; `@x.y.z` pins. On the host side only `engines`/peer ranges (pi-subagent-manager uses `">=0.99.2"`) express a minimum pi version; pi does not appear to enforce it beyond npm's resolution — treat as advisory. Breaking changes land in `$T`; `session_compact_failed` was "typed loosely for older hosts" in pi-goal-x, showing packages do defend against host skew.
- **Loading rules**: no timers/processes in the factory; `session_shutdown` must be idempotent; command-only ops from lifecycle handlers can deadlock; `project_trust` not delivered to package extensions; project `.pi/settings.json` only read after trust. Handler exceptions in `tool_call` block the tool.
- **No UI in `json`/`print` modes** (`ctx.hasUI === false`): every interactive gate needs a non-interactive policy (block, allow, or env-var override) or subagent runs will stall/fail.
- **Compaction loses `custom_message`s** before the cut point; **`custom` entries are invisible to the model**; **`context` injections are not persisted** (not in `/export`, not seen by other extensions' `session_start` reconstruction).
- **Tool names are global**: cannot unregister; collisions with other packages (e.g. an `ask_user` tool vs. `@juicesharp/rpiv-ask-user-question`) are first-wins/conflict — namespace ours (`devsys_*`).
- **Skills**: description-only in prompt; malformed frontmatter silently drops the skill; names collide globally (first wins).
- **Testing**: no dedicated extension test harness in the docs. Routes: (a) **SDK in-process**: `new DefaultResourceLoader({cwd, agentDir, additionalExtensionPaths: ["./extensions/x.ts"], extensionFactories: [...]}); await loader.reload(); const {session} = await createAgentSession({resourceLoader: loader, sessionManager: SessionManager.inMemory()}); session.subscribe(...); await session.prompt("..."); session.dispose()` (`$D/examples/sdk/06-extensions.ts:26-56`, `$D/docs/sdk.md:45-48,112`); drive a fake model via `pi.registerProvider` (`$E/custom-provider-gitlab-duo/test.ts` shows a provider-level test). (b) **Unit-test pure logic** (guards, parsers) with `node --test` as the scaffold already does. (c) `pi --extension ./x.ts --mode json -p "..."` for black-box CLI tests. No mock provider is documented in sdk.md.
- **Update semantics**: `pi update --extensions` reinstalls per the configured spec; `/reload` replaces the extension runtime in-session (handlers re-registered; state must come from entries/disk, not module globals).

---

## 7. Recommendations — goal → mechanism

**(a) Load opinionated defaults**
- Ship `skills/<topic>/SKILL.md` (lazy, spec-compliant) with descriptions that name the trigger ("Load before writing any ADR…"); `prompts/*.md` for workflow entry points (`/plan`, `/implement`, `/review`, `/decide`); one `extensions/dev-system/index.ts`.
- Inject the non-negotiable rules as a named system-prompt section in `before_agent_start` (`systemPromptOptions.sections["dev-system"]`) plus `promptGuidelines`; keep it stable for cache hits. Add tool `promptGuidelines` on our own tools.
- Use `resources_discover` to add project-conditional skills (e.g. only when `package.json`/`Cargo.toml` found).
- Optionally restrict `defaultTools` via `pi.setActiveTools` per phase.

**(b) Explicit judgement + recorded departures**
- Register `devsys_record_decision` tool (TypeBox schema: `decisionPoint`, `recommended`, `chosen`, `rationale`, `alternatives[]`, `reversible`) that: appends a `custom` entry (`dev-system.decision`), writes/updates `docs/decisions/NNNN-*.md` (or ADR), labels the entry, and updates the system-prompt digest.
- Guards: `tool_call` on `bash` (`git commit|push`, package publishes), `write`/`edit` (protected paths like `src/**` during plan phase, ADR dir outside decide phase) that **block with instructive `reason`** unless the current phase/decision-log state allows it. When `ctx.hasUI`, offer `select` → "Record departure" → `editor` for rationale; when not, block.
- `turn_end` checker: if the assistant message contains departure signals (configurable regex: "instead of", "deviating", "rather than the recommended") without a `devsys_record_decision` call in `toolResults`, return a `custom_message` draft + `continue: true` demanding the record (one retry max).
- `tool_result` augmentation: append "Tests last run: <n> edits ago" to edit/write results to keep the loop visible.

**(c) Survive long sessions/compaction**
- All state lives in `custom` entries + disk; rebuild in `session_start`/`session_tree` from `ctx.sessionManager.getBranch()`.
- Regenerate the phase/decision digest each request (system section for the stable part; `context` tail for volatile counters, pi-goal-x-style retention to keep cache).
- Own `session_before_compact` (or supply `customInstructions`) so the summary always carries a `## Development System State` block with phase, open decision points, recorded departures, and next required gate; on `session_compact` arm a one-shot `[POST-COMPACTION RESYNC]` message instructing re-reading plan/decision files.
- Prune stale injected reminders in `context`; trigger `ctx.compact()` at phase boundaries when `getContextUsage().percent` is high.

**(d) Less-capable implementer (Sonnet)**
- `model_select` + `ctx.model` → select a "strict" rule profile (more checklist, fewer options, mandatory `devsys_record_decision` before commit) when the model matches a configured list; display via `ctx.ui.setStatus("devsys", …)`.
- Prefer deterministic gates (`pi.exec` tests/lint/typecheck in `tool_call` before `git commit`) over prompt-only rules; the `reason` text is the corrective instruction.
- For delegation, either reuse `pi-subagent-manager` agents (frontmatter `modelSuggestions`/`tools.allow`) or spawn `pi --mode json -p --no-session --model … --append-system-prompt …` as in `$E/subagent/index.ts`; pass our rules through `--append-system-prompt`, and remember guards must be non-interactive there.

**(e) Incremental npm release + `pi update --extensions`**
- Keep raw `.ts` under `extensions/` (jiti) with `"pi"` manifest, add the four missing peer deps, keep `files` whitelist, `keywords: ["pi-package"]`. Existing CI (`.github/workflows/publish.yml`: gate → lint → test → publish via npm trusted publisher, semver gate `scripts/check-version.ts`) already supports continuous publishing; unpinned installs pick up each version on `pi update --extensions`.
- Document `pi install npm:@jwilger/pi-development-system` (unpinned) vs `@x.y.z` (pinned); feature-flag new gates via `pi.registerFlag` / settings-file keys read with `pi.getSettings()` or an own `.pi/dev-system.json` so releases can ship dark.
- Tests: pure-logic `node --test`; integration via SDK + `SessionManager.inMemory()` + a fake `registerProvider` model (unverified end-to-end; no mock provider documented).

### Open gaps / unverified
- No documented mock LLM provider for SDK tests; `custom-provider-gitlab-duo/test.ts` is the closest precedent (not run).
- Whether pi enforces `engines`/peer version minimums at install time — not found in docs; treat as advisory.
- pi-goal-x's goal-file layout is from source (`goal-files.ts:334/414`), not a public contract; may change between its releases.
- Exact persistence of `turn_end`-returned `custom_message` drafts vs `pi.sendMessage` ordering was read from types/docs, not exercised.
