---
description: Model a capability as event-model slices and validate them
argument-hint: "[directory of slice files, default docs/event-model]"
---
Event-model the work with the event-modelling skill.

1. If a tool named `event_model_validate` exists, an event-model extension is installed: use it for validation and rendering instead of the builtin check, and follow its own prompt.
2. Otherwise write one slice file per command, view or automation under the directory ($ARGUMENTS, default `docs/event-model`), in the schema the skill describes.
3. Call `devsys_event_model_check` with that directory. Fix every error it reports; `render` asks for the derived Markdown or Mermaid view. Do not edit the derived views by hand.
4. If the validator wants a fact the model does not have, ask the user. Never invent a policy, field or event to make validation pass.
5. When the model is clean, write one failing test per Given/When/Then scenario with the profile's `references/gwt-tests.md`.
