# PI14-6 — Tool discovery and changing activation

## Task

Keep rarely used development-system tools discoverable without expanding the direct prompt surface when pi 1.4 tool search is active. Refresh the fallback when discovery activation changes, using public APIs and preserving explicit activations.

## Scope and policy

- An active `codemode` or `tool_search` provides discovery. Neither active means the four rarely used tools fall back to direct exposure.
- Synchronize at session startup, before agent start, and at turn end. Persist fallback ownership across reload/resume. Only remove declarations added by our own fallback; preserve independently activated tools.
- Judge wrappers remain script-oriented codemode tools. Model-only workflow tools remain non-callable from scripts. Hidden tools remain unreachable.
- Preserve child allow/block policy, inherited loadout metadata and root hook execution; no runtime rewrite or new dependency.
- No model-visible instruction changes are planned; documentation describes verified behavior.

## Test list

- [x] Real tool-search-only startup keeps rarely used tools out of direct declarations, and search activates a selected tool.
- [x] Turning discovery off restores direct fallback; turning it back on removes only fallback declarations, including the first provider request after each transition.
- [x] Tool-driven activation is reflected on the next request within the same run; a real reload preserves fallback ownership and pending late tool registrations, including those arriving in later before-agent hooks.
- [x] Explicitly activated rare tools survive discovery changes.
- [x] Navigating to a tree node before the ownership entry cannot relabel automatic fallback as explicit; returning to a discovery branch preserves search-activated tools and withdraws new fallback tools that branch never mentioned.
- Legacy selections with unknown provenance remain active; no destructive migration heuristic (ADR 0008).
- [x] Real SDK search excludes hidden/model-only tools; nested execution preserves model-only restrictions.
- [x] Child allowed/blocked selection continues to apply to discoverable inherited tools.

## Verification

Run focused offline SDK tests, full unit tests, strict TypeScript, Biome, Knip and Markdown lint. Check changed TypeScript paths with active LSP diagnostics. Complete fresh-context review and rationale-bearing delivery on green trunk.
