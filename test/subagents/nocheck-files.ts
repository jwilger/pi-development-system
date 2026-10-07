/**
 * Vendored files that still carry `// @ts-nocheck` (see src/subagents/VENDORED.md).
 * Ratchet: this list may only shrink. Clean a file, drop its header, delete its line here.
 * A new file under src/subagents must be type-clean and must not be added to this list.
 */
export const NOCHECK_FILES: readonly string[] = [
  "src/subagents/index.ts",
  "src/subagents/orch/inherited-tools.ts",
  "src/subagents/orch/mailbox.ts",
  "src/subagents/orch/paths.ts",
  "src/subagents/orch/prompt.ts",
  "src/subagents/orch/runtime.ts",
  "src/subagents/orch/tools.ts",
  "src/subagents/orch/transcript.ts",
  "src/subagents/prefs/agent-import.ts",
  "src/subagents/prefs/config.ts",
  "src/subagents/prefs/import-discovery.ts",
  "src/subagents/prefs/import-instructions.ts",
  "src/subagents/prefs/models.ts",
  "src/subagents/prefs/settings.ts",
  "src/subagents/types.ts",
  "src/subagents/ui/agent-navigation-editor.ts",
  "src/subagents/ui/dialog.ts",
  "src/subagents/ui/import-picker.ts",
  "src/subagents/ui/live-agent-view.ts",
  "src/subagents/ui/model-picker.ts",
  "src/subagents/ui/settings-ui.ts",
  "src/subagents/ui/status-ui.ts",
  "src/subagents/ui/thread-tree.ts",
  "src/subagents/ui/ui.ts",
];
