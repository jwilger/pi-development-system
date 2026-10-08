---
name: profile-design-system
description: Design-system discipline for UI work - tokens before components, building only from existing design-system materials, and a logged decision when something does not fit. Use when a slice adds or changes user interface (components, styles, pages), when a repo has a design system or token files (*.tokens.json, .css, .scss, .tsx, .vue, .svelte), or when reviewing UI code for snowflakes and raw values.
---

# Design-system profile

Brad Frost's stance, as this system applies it: the AI is deliberately constrained to the
design system's materials. That constraint is what separates working inside a design
system from vibe coding. Treat the agent as a smart but sometimes unsophisticated
junior developer who has read the system's codebase and must follow its conventions.

## Order of work: tokens, then components, then pages

1. **Tokens.** Three tiers. Raw (`color-brand-green`) feeds semantic
   (`theme-color-primary-background`), which feeds component (`button-primary-background`).
   Components read the component tier; they never reach for a raw value.
2. **Components.** Structure, behaviour and accessibility live in a structural component
   library, kept apart from the aesthetic token layer. Do not fork a component to change
   how it looks; change tokens.
3. **Pages.** A page is the test of the system. Build it with real content in more than
   one shape: a 40 and a 340 character headline, one and ten items, empty and error.
   Anything that breaks goes back to the component, not into a page-level patch.

## Defaults for a UI slice

- **Use an existing component.** Search the design system first and name what you found
  in the task record. The plan lists the states and variants the slice must show
  (default, hover, focus, disabled, loading, empty, error, long content, narrow screen).
- **No raw values in components.** No hex colours, pixel sizes, z-indexes or font
  stacks inline. Make this a lint (stylelint, a biome or eslint rule, a grep in CI);
  prose alone is a write-only channel and is not enforced.
- **Build states outside the app first** when the repo has Storybook or a pattern lab:
  write the story with real-content variants, then wire the component into the app.
- **Accessibility is part of the component**, not a later pass: roles, labels, keyboard
  path, focus order, contrast from the token pair, reduced motion.

## When it does not fit: 90 percent and missing components

Product pressure will find a way around the system. Decide, do not drift.

| Situation | Decision | Record |
| --- | --- | --- |
| The component fits | Use it as is | nothing |
| It fits about 90 percent | Extend through a documented variant or a token; ask the system owner when the variant is not yours to add | a line in the task record |
| Nothing fits, and the need will recur | Propose a new component to the system, build it there first | an ADR if it changes the component API |
| Nothing fits, and the need is one of a kind | A snowflake: allowed once, local, labelled | `devsys_record_departure` with gate `scope.expansion:snowflake`, naming the 90 percent reasoning and when to revisit |

A snowflake written without that record is a defect to fix in review, not a style
preference.

## Checklist

- [ ] The slice names the design-system components it uses, or why none fits.
- [ ] No raw colour, size or font value in a component; the tier rule has a lint.
- [ ] Every state and variant in the plan has a story or screenshot with real content.
- [ ] Keyboard, focus, labels and contrast checked on the new or changed component.
- [ ] Any snowflake or forked component has its recorded decision.

## Do not

- Do not invent a component, a token or a variant the system does not have without the
  decision above.
- Do not copy a component's markup into a page to restyle it.
- Do not choose a different UI library for one slice.
- Do not let a generated component through that only looks right in the happy case.
