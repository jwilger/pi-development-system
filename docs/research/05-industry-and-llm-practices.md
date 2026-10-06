# 05 — Industry Thinkers and LLM-Agent Governance Practices

**Purpose.** Inform the design of a strongly-opinionated AI-SDLC extension for the pi coding-agent harness: encode the author's principles as defaults, force explicit judgement calls at decision points, and record every departure from the recommended approach with reasoning.

**Method and provenance.** Research done 2026-10-06 with `curl` fetches of primary sources (svpg.com, producttalk.org, bradfrost.com, newsletter.kentbeck.com, fsharpforfunandprofit.com, eventmodeling.org, chadfowler.com, davefarley.net, docs.claude.com, anthropic.com/engineering, agentskills.io, agents.md, developers.openai.com, cursor.com/docs, kiro.dev, export.arxiv.org) plus `gh api` reads of obra/superpowers (main @ `8ca22db`), github/spec-kit, bmad-code-org/BMAD-METHOD, dilgerma/* repos. No dedicated web-search tool was available; discovery was by direct URL, site archives, GitHub search, and the arXiv API. Dates are publication dates where shown on the page; "accessed 2026-10-06" otherwise. Items marked **[not retrieved]** rely on well-established knowledge of the work and should be verified before quoting. Book contents are cited via publisher pages/TOCs, not full text.

---

## Part A — Industry thinkers

### A1. Marty Cagan — product discovery, outcomes, four risks, empowered teams

**Actionable principles**

1. **Four big risks, tackled early, before building.** Value (will customers buy/use it), usability, feasibility (can we build it), business viability (does it work for the business). PM owns value + viability, designer owns usability, lead engineer owns feasibility. "Tackle the big risks early", "figure out solutions collaboratively", "focus on solving problems – not features or a roadmap". — *The Four Big Risks*, SVPG, 2017-12-04, https://www.svpg.com/four-big-risks/
2. **Outcome over output; product model over project model.** Project model = roadmap → PRD → design → build (output). Product model = team given a problem/outcome and accountable for results. "Building the feature or project is no longer the bottleneck … the real bottleneck is in discovering a solution that's worth building"; AI-accelerated project-model teams become a "turbo-charged feature factory". — *Build to Learn vs Build to Earn*, 2026-04-16, https://www.svpg.com/build-to-learn-vs-build-to-earn/ (FAQ 2026-04-27, https://www.svpg.com/build-to-learn-faq/)
3. **Two different kinds of "testing".** Discovery testing = test 10–20 prototypes/week against the four risks (value/usability with users, feasibility with engineers, viability with stakeholders). Delivery testing = scale, performance, fault tolerance, reliability, accuracy, privacy, security, ops, i18n. Don't confuse them. — same source.
4. **Prototypes are not products.** Prototyping tools (Lovable/Bolt/Figma Make) are for learning; commercial products need "reliability is our most important feature", telemetry/observability "to detect issues and also to report outcomes", scale, zero-downtime, security, compliance, DR. Internal tools have a shorter path to product quality. — *Prototypes vs Products*, 2025-11-07, https://www.svpg.com/prototypes-vs-products/
5. **Empowered teams get problems to solve, not features to build.** Teams exist "to serve the customers, in ways that meet the needs of the business"; leaders cite "trust" as the excuse for not empowering. — *Empowered Product Teams*, 2018-10-31, https://www.svpg.com/empowered-product-teams/
6. **AI productivity paradox.** Atlassian State of Teams 2026: "89% of executives say AI has increased the speed of work, but only 6% … can point to specific organization-wide AI ROI". Most teams use AI to accelerate project-model artifacts (business cases, roadmaps, PRDs, code); strong teams use AI first for discovery, then for commercial-quality delivery. — *The AI Productivity Paradox*, 2026-07-23, https://www.svpg.com/the-ai-productivity-paradox/
7. **Product vision/strategy/principles as the frame for team decisions** (book *Empowered*, 2020 **[not retrieved]**); Cagan's 2026 "ten regrets" talk lists underestimating viability risk and undervaluing solution discovery. — *Strong Opinions, Loosely Held*, 2026-09-27, svpg.com.

**Implications for the extension**
- Every feature-level plan must carry an explicit **outcome statement** and a **four-risk assessment** (value/usability/feasibility/viability) with the evidence status of each; "unassessed" is a legal but recorded state.
- Distinguish **build-to-learn** (prototype mode: skip delivery gates, mark artifacts disposable) from **build-to-earn** (full gates). Mode is a recorded decision, not an inference.
- Delivery-mode checklists must include Cagan's commercial-quality list (observability that reports *outcomes*, reliability, security, i18n) so "done" ≠ "demoable".
- Model-facing prompts should phrase work as *problems to solve with a target outcome*, not as feature tickets; the agent must state which risk it is retiring with each slice.

### A2. Teresa Torres — Continuous Discovery Habits

**Actionable principles**

1. **Outcome at the top sets the scope.** The OST root is an outcome, preferably a *product* outcome, stated as direction + target (e.g., first-session "aha" from 22% to 25%). — *Opportunity Solution Tree*, https://www.producttalk.org/opportunity-solution-tree/ (accessed 2026-10-06)
2. **One small opportunity at a time** (kanban-style WIP limit on discovery). — same.
3. **Compare and contrast ≥2 solutions** for the target opportunity; single-solution thinking is the failure mode. — same.
4. **Assumption testing, not solution testing.** Five categories: desirability, viability, feasibility, usability, ethical (labels don't matter, coverage does). Generate assumptions via story mapping each solution, walking the OST links, data audit, pre-mortem. "Be specific. The more specific your assumption is, the smaller and faster the test." Riskiest = critical to success + little evidence. Test types: prototype tests, one-question surveys, data mining, research spikes. Record test design + evidence. — *Assumption Testing*, https://www.producttalk.org/assumption-testing/
5. **Living document; weekly touchpoints.** Revisit the tree every 3–4 interviews; "don't make up opportunities from scratch"; one tree per trio per outcome; roadmap = solutions already vetted. — OST page; book announcement 2021-05-19, https://www.producttalk.org/2021/05/continuous-discovery-habits/
6. **Evals as a discovery habit (2025–26).** Torres treats AI evals as a continuous discovery activity — "4 New Evals and 16 Experiment Variants to Fix 1 Customer Complaint" (producttalk.org, 2026).

**Implications for the extension**
- Maintain a per-project `discovery/` artifact: outcome → opportunities → solutions → assumptions, each assumption tagged with category, risk (criticality × evidence), and test status. The agent cites which assumption a slice retires.
- Force the "≥2 solutions considered" rule at design decision points: a plan that proposes one solution must record *why alternatives were not compared* (a legitimate, logged deviation).
- Treat test/eval suites as assumption-tests: each GWT spec maps to an assumption or a requirement line.

### A3. Brad Frost — Atomic Design, design systems, tokens, front-end workflow

**Actionable principles**

1. **Atoms → molecules → organisms → templates → pages**; organisms are "standalone, portable, reusable"; pages "test the effectiveness of the design system" with real-content variations (40 vs 340-char headline, 1 vs 10 cart items) and loop fixes back into components. — *Atomic Web Design*, 2013-06, https://bradfrost.com/blog/post/atomic-web-design/
2. **Three-tier tokens:** raw (`color-brand-green`) → semantic (`theme-color-primary-background`) → component (`button-primary-background`). — *The Many Faces of Themeable Design Systems*, https://bradfrost.com/blog/post/the-many-faces-of-themeable-design-systems/
3. **New separation of concerns:** structural component library (structure, function, a11y) decoupled from the aesthetic token layer; teams that fork for aesthetics lose structural benefits. — 2025-06-18, https://bradfrost.com/blog/post/the-new-separation-of-concerns/
4. **Governance must plan for "Life, uh, finds a way."** Product teams prioritise shipping over system integrity; define the process for "component missing" and "90% fit"; explicit snowflake-vs-system decision. — *A Design System Governance Process*, 2019-11-04, https://bradfrost.com/blog/post/a-design-system-governance-process/
5. **Front-end workshop environment:** author UI in Storybook/Pattern Lab, outside the app, to "quickly create real product scenarios without having to build that functionality out for real". — 2018-11-01, https://bradfrost.com/blog/post/a-frontend-workshop-environment/
6. **AI + DS:** AI trained on the DS codebase is a "component boilerplate generator on steroids" (40–90% faster); treat it as a "smart-but-sometimes-unsophisticated junior developer"; be "skeptical of general-purpose AI code generators and err on the side of solutions … closely tailored to the organization's hard-won conventions". Uses: component generation, cross-framework translation, unit tests from pseudo-code, a11y review. — 2024-02-27, https://bradfrost.com/blog/post/ai-and-design-systems/
7. **Agentic design systems:** Storybook MCP; what separates "DS+AI" from vibe coding is that "the AI is deliberately constrained to using the high-quality design system materials". — 2025-12-16, https://bradfrost.com/blog/post/agentic-design-systems-in-2026/

**Implications for the extension**
- A UI slice's default is "use an existing DS component"; introducing a new component or a snowflake is a logged deviation with Frost's 90%-fit reasoning.
- Require token-tier discipline (no raw hex/px in components) as a deterministic lint, not prose.
- Prefer building UI states in the workshop environment (Storybook) with real-content variants before wiring to the app; agent should enumerate states/variants in the plan.

### A4. Kent Beck — TDD, XP, Tidy First, 3X, test desiderata, augmented coding

**Actionable principles**

1. **Canon TDD:** (1) write a test list; (2) turn exactly one item into a concrete runnable test; (3) change code to make it and all previous tests pass, adding to the list as you learn; (4) optionally refactor; (5) repeat until the list is empty. Interface design happens in step 2, implementation design in step 3. — 2023-12-11, https://newsletter.kentbeck.com/p/canon-tdd
2. **Tidy First — structural vs behavioural changes never share a commit;** structural first. "Make the change easy, then make the easy change" (tweet 2012-09-25 **[not retrieved]**).
3. **Test desiderata:** isolated, composable, deterministic, fast, writable, readable, behavioural, structure-insensitive, automated, specific, predictive, inspiring; properties trade off. — https://kentbeck.github.io/TestDesiderata/ (orig. 2019)
4. **Augmented coding ≠ vibe coding.** "In vibe coding you don't care about the code, just the behavior… In augmented coding you care about the code, its complexity, the tests, & their coverage." Warning signs to intervene: "Loops. Functionality I hadn't asked for (even if it was a reasonable next step). Any indication that the genie was cheating, for example by disabling or deleting tests." First two attempts "accumulated so much complexity that the genie completely stalled" until Beck "intruded more on the design & tried to keep the genie from coding ahead." His system prompt: "Always follow the instructions in plan.md. When I say 'go', find the next unmarked test in plan.md, implement the test, then implement only enough code to make that test pass"; "Always write one test at a time"; commit only when all tests pass, warnings resolved, single logical unit, message says structural/behavioural. — 2025-06-25, https://tidyfirst.substack.com/p/augmented-coding-beyond-the-vibes
5. **Genie tarpit:** "Genies give you code that's a degraded facsimile of the mediocre code it trained on"; the "plausible deniability task orientation of the genie leaves it claiming success even though the code doesn't work at all. And complexity piles on complexity." — 2026-04-29, https://newsletter.kentbeck.com/p/genie-tarpit
6. **Scope is the steering wheel:** cut scope, not quality; "cutting scope generates more feedback sooner". — 2026-05-21, https://newsletter.kentbeck.com/p/scope-is-the-steering-wheel
7. **Outcome-orientation beats multi-agent plumbing:** "I was managing it… Holding state in my head that the system should have been holding for me… Multi-agent is a feature. Outcome-orientation is the thing." — 2026-04-23, https://newsletter.kentbeck.com/p/genie-lessons-nobody-wants-agents
8. **Prose as a programming language / pre- and post-conditions:** components with `requires`/`ensures`; "sub-agents pass pointers instead of data. Variable bindings are files… Context management, done at the file system level." — 2026-05-26, https://newsletter.kentbeck.com/p/genie-lessons-from-genie-sessions
9. **3X:** Explore (cheap experiments, discard), Expand (next bottleneck), Extract (small safe optimisations); "Applying the approach from one phase to an idea in another phase kills ideas." — 2026-07-30, https://newsletter.kentbeck.com/p/canon-3x-exploreexpandextract
10. **TCR as a skill** (`test && commit || revert`) is a viable hard constraint for agents. — 2026-04-01, https://newsletter.kentbeck.com/p/genie-sessions-tcr-skill

**Implications for the extension**
- The implementation loop should be Beck's literal prompt: plan file with a test list; one test at a time; minimal code; refactor as a separate structural commit. This is cheap to make *deterministic* (Stop hook: tests green; commit-message prefix `structural:`/`behavioral:`).
- Treat Beck's three warning signs as hook-detectable: test deletions/skips (`PreToolUse` deny on edits that remove `test`/add `.skip`), unrequested functionality (diff-scope vs task Files list), loops (repeated identical tool calls).
- Record the 3X phase per project; Explore-phase work legitimately relaxes Extract-phase gates — but the phase choice is a recorded decision.

### A5. Scott Wlaschin — Domain Modeling Made Functional

**Actionable principles**

1. **Make illegal states unrepresentable** (phrase from Yaron Minsky): encode rules like "contact must have email OR postal address" as union types rather than validation code. — 2013-01-14, https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/
2. **Make state explicit:** state machines as union types, transitions as functions. — 2013-01-16, https://fsharpforfunandprofit.com/posts/designing-with-types-representing-states/
3. **Workflows as pipelines of typed functions; types as documentation** — the type signature *is* the ubiquitous-language spec. — *Domain Modeling Made Functional*, PragProg 2018, https://pragprog.com/titles/swdddf/domain-modeling-made-functional/ ; talk https://fsharpforfunandprofit.com/ddd/
4. **Railway-oriented programming** for expected failures (two-track `Result`). — https://fsharpforfunandprofit.com/rop/ (NDC 2014)
5. **…but not thoughtlessly.** Don't use `Result` when you need diagnostics ("glorified boolean with extra information… only for expected control-flow"), to reinvent exceptions, when you need fail-fast, when nobody sees the error, or when nobody cares. — 2019-12-20, https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/

**Implications for the extension**
- Make "types first" a default design step: each slice's plan lists the domain types (including the illegal states it rules out) before tests. A slice that validates at runtime what could be a type is a recorded deviation.
- Enforce the Result-vs-exception rule as prose with Wlaschin's five exceptions listed, so the agent must name which exception applies when it chooses to throw.
- Interfaces between tasks in a plan (consumes/produces) should be expressed as type signatures — this is what makes "a task's implementer sees only their own task" safe.

### A6. Adam Dymitruk — Event Modeling

**Actionable principles** (all from *Event Modeling: What is it?*, 2019-06-23, https://eventmodeling.org/posts/what-is-event-modeling/)

1. **The blueprint:** wireframes on top in actor/system swimlanes; commands (blue) are transactional boundaries; events (orange) are the only facts; views/read-models (green) are passive and "cannot reject an event".
2. **Four slice types:** command (state change), view (state view), automation (processor + "todo list" pattern), translation (views fed from external events).
3. **Seven steps:** 1 Brainstorm only state-changing events ("guest viewed calendar" is not an event); 2 Plot the timeline; 3 Storyboard with wireframes ("each field must be represented"; no stacked screens — each state change is its own vertical slice); 4 Identify inputs (commands); 5 Identify outputs (views); 6 Apply Conway's Law (event swimlanes = team-ownable autonomous parts); 7 Elaborate scenarios as GWT per workflow step, collaboratively.
4. **Information completeness check:** "every field accounted for. All information has to have an origin and a destination"; skipping it means absorbing rework later.
5. **Output = many very small projects.** "A set of very small projects defined by all the scenarios for each workflow step… directly translated to… unit tests… coupled to adjacent workflow steps by only the contract." Strong contracts (pre/post-conditions) give a "flat cost curve": implementing one step never forces revisiting another; refactoring scope is one step.
6. **GWT per command** ("Given registered + payment method, When book a room, Then room is booked"); Given-Then for views.

**Implications for the extension**
- The planning artifact should be an event model, with slices as the unit of work and GWT scenarios as the unit of test. A plan that is not a slice list needs a recorded reason.
- Run the completeness check mechanically where possible (every wireframe field has an origin event and a destination view/command); agent reports gaps rather than inventing fields.
- Slice independence ("coupled only by the contract") is what lets a weaker model implement one slice with a clean context.

### A7. Martin Dilger — event sourcing, slices, GWT → code, AI + event modeling

**Sources inspected (gh api, 2026-10-06):** dilgerma/eventsourcing-book, event-modeling-spec, nebulit-code-generators, slicing-foundations, a Ralph-loop repo (prompt.md, ralph.sh, slice.json, SKILL.md @ `170f5ad`), eventmodelers.ai marketing copy. *Understanding Eventsourcing* (Leanpub) **[not retrieved]**. Note: the term "Nexus" for Dilger's approach was **not found** in any source inspected; the approach is branded Nebulit / eventmodelers.ai.

**Actionable principles**

1. **The model is machine-readable and authoritative.** "Event models are machine-readable blueprints — precise inputs lead to precise outputs"; "Structured slice prompts per feature". Ralph prompt: "JSON is the desired state… The slice in the json is always true, the code follows… There must be no specification in json, that has no equivalent in code."
2. **User stories compress too much.** "A user story compresses a whole business process into a paragraph… AI agents guess when the spec is vague… Ambiguous tickets produce confident, wrong code." (eventmodelers.ai)
3. **Slice spec format:** `slice.json` with commands/events/views, each field `name/type/cardinality/idAttribute/technicalAttribute/example`, and specs as Given (prior events, `linkedId` → event id) / When / Then. Example: "Add Item – can only hold 3 items" with Given = three "Item added" rows.
4. **Skill per slice type** (`state-change-slice` SKILL.md): "you MUST create" `{Slice}Command.ts`, `{Slice}.test.ts`, `routes.ts`, `ui-prompt.md`; decide/evolve/initialState with `@event-driven-io/emmett`, tests via `DeciderSpecification.for({decide,evolve,initialState}).given([...]).when(cmd).then([...])`.
5. **Loop discipline (ralph.sh / prompt.md):** step 0 "Do not read the entire code base"; one slice per iteration; `npm run build, npm run test` before commit `feat: [Slice Name]`, FF-merge; step 16 "Always append your learnings to AGENTS.md in a compressed form"; `progress.txt` entries "## [Date/Time] - [Slice] … **Learnings for future iterations:** Patterns discovered / Gotchas / Useful context"; a "## Codebase Patterns" section at the top, "Only add patterns that are general and reusable". `MAX_ITERATIONS` default 10; stop on `<promise>COMPLETE</promise>`; archive prd.json/progress.txt per branch.
6. **Generated code is a starting point:** nebulit-code-generators template notes "Your code guidelines take precedence… code may not compile right away".

**Implications for the extension**
- Adopt a structured slice spec (JSON or YAML) as the source of truth for implementation, with GWT rows that compile directly to decider tests. The spec→test mapping should be 1:1 and verifiable (every spec has a test; every test cites a spec).
- Copy the "learnings in compressed form" ritual but gate it: appended learnings must be general; the extension can diff AGENTS.md growth per session and require a rationale comment per added rule (see B2 evidence on CLAUDE.md growth).
- "Do not read the entire codebase" + "the slice is always true" is the right posture for Sonnet-class implementers (see B5).

### A8. Chad Fowler — Passionate Programmer, disposable software, "Regenerative Software"

**Sources:** chadfowler.com/regenerative-software/ series (2025-12 → 2026-08), github.com/chad/phoenix. Older posts ("Legacy" 2013, "Tiny" 2014) are 404 on chadfowler.com; *The Passionate Programmer* 2nd ed. (PragProg, https://pragprog.com/titles/cfcar2/the-passionate-programmer-2nd-edition/) **[not retrieved]**.

**Actionable principles**

1. **The bottleneck moved from production to validation.** "Generation is cheap. Confidence is not." The limiting factor is "understanding, evaluating, and governing" software. — *Regenerative Software*, 2025-12-21, https://www.chadfowler.com/regenerative-software/3majnyfydzs2y/ ; *The Deletion Test*, 2026-01-24, …/3md5ftetaes2e/
2. **The deletion test:** "If I deleted this codebase and regenerated it from scratch, what would I rely on to decide whether the result was correct?" If the answer is "the old code", the code is silently acting as spec, test suite, docs and bug database. "Oracles, not artifacts."
3. **Evaluations are the real codebase:** "If deleting your codebase feels terrifying, your evaluations are insufficient." Durable evals = invariants, contracts, property-based tests, end-to-end behavioural checks; unit tests coupled to signatures don't survive reimplementation. Writing durable evals is "harder than writing the code they specify". — 2025-12-29, …/3mb526js42k26/
4. **Gradient of trust / constraints as trust:** small pure typed functions can be trusted without reading; network/business-rule code cannot. Strong types and purity "was always valuable. AI makes it load-bearing." Two strategies: express work as constrained transformations; quarantine messy parts so "failure is cheap, contained, observable, and reversible". "Better shapes beat better prompts." — 2025-12-28, …/3mb2qb6odxc2d/
5. **Provenance is the new version control:** "the unit of change is no longer lines of code. It's reasons"; "The plan that matters isn't free-form thinking. It's the decision record: chosen strategy, rejected alternatives, and the constraints that forced the choice… The plan is not documentation. It is part of the implementation." — 2026-01-13, …/3mcbiyal7jc2y/
6. **Conversation is the commit:** manual edits to generated code are "editing compiled binaries… an escape hatch, not a methodology"; creates "provenance debt". — 2026-03-26, …/3mhxvpam4z22z/
7. **Regenerative grain (from the 2014 "Tiny" talk):** "Small means safe to delete." Grain tests: comprehension (~10 min), isolation (verify at boundary without booting half the system), mutation ownership (one logical writer), contracts (versioned, schema-enforced). — 2026-02-19, …/3mfai4nqg6224/
8. **Implementation remembers:** before regenerating ask "What does this implementation know that we have forgotten?" (the 17-second timeout). "Clean code that forgets why it exists is just a more elegant way to fail." — 2026-06-14, …/3mobohx4fq22x/
9. **Specification is not a document:** knowledge is a queryable graph (formal/executable/observational/textual) traced to sources, not one SPEC.md. — 2026-08-19, …/3mtgs36dnq22o/
10. **Relocating rigor:** XP "compressed feedback loops until truth became unavoidable. Tests replaced promises"; when the name took over "the rigor drained out". — 2026-01-06, …/3mbrvhyye4k2e/

**Implications for the extension**
- The decision log the author wants is exactly Fowler's provenance record: for each deviation, *chosen strategy, rejected alternatives, constraints that forced the choice*. Make it a structured artifact adjacent to the plan, committed with the code.
- Build the deletion test into reviews: "Which oracle (spec/GWT/property test/invariant) would catch this if the code were regenerated?" If none, the slice is incomplete.
- Prefer durable oracles (contracts, properties, end-to-end GWT) as the deterministic gates; keep signature-coupled unit tests advisory.

### A9. Dave Farley — Continuous Delivery, Modern Software Engineering (brief)

- Engineering = "application of scientific style reasoning"; "Engineering != Bureaucracy"; "Production is not our problem… our problem is always one of learning, discovery and design" — *What is Modern Software Engineering?*, 2022-01-30, https://www.davefarley.net/?p=352
- Book structure (Addison-Wesley 2021, ISBN 9780137314911, TOC via pearson.com): Part II *Optimize for Learning* — Working Iteratively ("The Lure of the Plan"), Feedback ("Prefer Early Feedback"), Incrementalism, Empiricism ("Avoiding Self-Deception"), Being Experimental (Hypothesis / Measurement / Controlling the Variables / "Automated Testing as Experiments"); Part III *Optimize for Managing Complexity* — Modularity ("Designing for Testability Improves Modularity"), cohesion, separation of concerns, abstraction, coupling.
- *Continuous Delivery* (Humble & Farley, 2010) **[not retrieved]**: deployment pipeline, everything in version control, done = released.

**Implications for the extension**
- Frame every slice as an experiment: hypothesis (the GWT), measurement (the test run), controlled variables (one slice, one branch). "Avoiding self-deception" maps to B3's "show evidence, don't assert".
- Testability as a design gate: if a slice can't be verified at its boundary, that is a modularity defect to record, not a reason to skip the test.

---

## Part B — Governing LLM coding agents in harnesses

### B1. Writing effective rules / skills / system prompts

**Evidence**

- **Anthropic Agent Skills best practices** (docs.claude.com, accessed 2026-10-06, https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices): only `name` + `description` are preloaded; SKILL.md is read when relevant (progressive disclosure). "Default assumption: Claude is already very smart… Only add context Claude doesn't already have." **Degrees of freedom:** high (prose, multiple valid approaches), medium (pseudocode/scripts with parameters), low (specific scripts) when "operations are fragile and error-prone / consistency is critical / a specific sequence must be followed". Keep SKILL.md body < 500 lines; references one level deep (nested refs get partial reads). Provide "a checklist that Claude can copy into its response and check off"; "Implement feedback loops: run validator → fix errors → repeat"; avoid time-sensitive info; consistent terminology; "Test with all models you plan to use" (Haiku: enough guidance? Sonnet: clear? Opus: not over-explained?).
- **Agent Skills spec** (https://agentskills.io/specification): `SKILL.md` + optional `scripts/`, `references/`, `assets/`; frontmatter `name` (≤64, lowercase/hyphens), `description` (≤1024, third person, what + when), optional `license`, `compatibility` (≤500), `metadata` (string map), `allowed-tools` (experimental).
- **Claude Code best practices** (anthropic.com/engineering/claude-code-best-practices, modified 2026-10-06): "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills." CLAUDE.md: "For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" Include: bash commands, style *differences from defaults*, test runners, repo etiquette, architecture decisions, env quirks, gotchas. Exclude: derivable info, standard conventions, API docs, frequently changing info, file-by-file descriptions, "write clean code". "If Claude keeps skipping one instruction, add emphasis such as 'IMPORTANT' to that line alone. If you emphasize many lines, none of them stands out." "If you could describe the diff in one sentence, skip the plan."
- **Codex AGENTS.md** (https://developers.openai.com/codex/guides/agents-md; https://agents.md/, 60k+ projects): precedence global → project root → cwd, one file per dir, `AGENTS.override.md` first; files are concatenated root-down so "files closer to your current directory override earlier guidance because they appear later"; cap `project_doc_max_bytes` 32 KiB.
- **Cursor rules** (https://cursor.com/docs/context/rules): `.cursor/rules/*.mdc` with `alwaysApply`/`description`/`globs` → Always / Apply Intelligently / file-glob / manual. "Keep rules under 500 lines"; split composable; "Reference files instead of copying their contents"; avoid "Copying entire style guides: Use a linter instead", documenting every command, rare edge cases.
- **Empirical:** *Guardrails Beat Guidance* (arXiv 2604.11088, 2026-04-13; 679 rule files, 5,000+ Claude Code/Opus 4.6 runs on SWE-bench Verified): random rules improved pass rate as much as expert-curated (+13.8pp) — gains are mostly context priming; "every individually beneficial rule is a negative constraint ('do not refactor unrelated code'), while every individually harmful one is a positive directive ('follow code style')"; recommendation: "constrain what agents must not do, rather than prescribing what they should". *Do Context Files Help Coding Agents?* (arXiv 2607.27250, 2026-07-28; 288 runs): context-file strategy did not measurably move correctness (≤10–15pp); failures were implementation skill, not missing repo knowledge. *Agent Skill Evolution* (arXiv 2610.04832, 2026-10-04; 2,608 revision pairs): adding a rule raises required-action rate +0.23 and correctness +0.10, gains concentrated in rules that **name a command or path**; with lazy loading agents retain ~51% of the gain. *Why Does CLAUDE.md Keep Growing?* (arXiv 2608.11095, 2026-08-11; 247,694 instruction lifetimes): +226% growth, +4.9 net instructions/commit, old instructions rarely deleted; adding "prompt comments" (rationale) removed 99.3% of excess instructions and improved instruction-following up to 23.1%.

**Implications for the extension**
- Structure the extension as **skills with progressive disclosure**: a short always-on core (negative constraints + commands/paths + decision-point protocol) and per-phase skills (discovery, event-modeling, slice-implementation, review) loaded on demand; body < 500 lines each, references one level deep.
- Write rules as **negative constraints with named commands/paths** ("Do not edit files outside the task's Files list"; "Run `npm test` before `git commit`"), not style sermons. Push style into linters.
- Every rule carries a one-line **rationale comment**; the extension should audit rule-file growth and prompt deletion (catastrophic remembering).
- Ship **copyable checklists** for each gate so the model's self-check is externalised in its output (see B3 evidence: external checklist 10/10 vs generic self-check 5/10).
- Test skills against every target model (Haiku/Sonnet/Opus), per Anthropic guidance.

### B2. Anti-drift in long-running sessions

**Evidence**

- **Context rot is real and non-uniform.** Chroma *Context Rot* (2025-07-14, https://research.trychroma.com/context-rot; 18 models incl. GPT-4.1, Claude 4, Gemini 2.5): "models do not use their context uniformly… performance grows increasingly unreliable as input length grows", even on minimal tasks. *Lost in the Middle* (arXiv 2307.03172, 2023): recall best at beginning/end, worst in the middle. Anthropic *Effective Context Engineering* (2025-09-29, https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents): "context rot… a performance gradient rather than a hard cliff"; aim for the "right altitude… Goldilocks zone" between "hardcoding complex, brittle logic in their prompts" and "vague, high-level guidance".
- **Multi-turn degradation.** *LLMs Get Lost in Multi-Turn Conversation* (arXiv 2505.06120, 2025-05-09; 200k+ simulated conversations): avg 39% drop vs single-turn; "LLMs often make assumptions in early turns and prematurely attempt to generate final solutions… when LLMs take a wrong turn in a conversation, they get lost and do not recover." *Persistent Personas?* (arXiv 2512.12775, 2025-12-14): instruction-following degrades over 100+ rounds.
- **Coding-agent-specific.** *When and How Context Rot Appears in Coding Agents* (arXiv 2607.17937, 2026-07-20; Codex gpt-5.4-mini, code-audit skill): 8/10 pass with 11k-char context vs 3/10 with 299k-char context, whether the extra context was relevant or irrelevant; requirement coverage stayed >92% yet a few omissions invalidated the artifact; no universal threshold (a second task passed every run). Failure classes: lost requirements, editing drift, failed checking. **"A detailed external checklist passes 10/10 runs, compared with 5/10 for a generic self-check (p = 0.0325)."**
- **Harness techniques (Anthropic, 2025-11-26, https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):** "compaction isn't sufficient". One-shot Opus 4.5 failed by (1) doing too much at once and running out of context mid-feature, (2) a later instance seeing progress and declaring the job done. Fix: initializer agent creates `init.sh`, `claude-progress.txt`, a feature-list JSON (200+ features, all marked failing), initial commit; coding agent works "on only one feature at a time", commits with descriptive messages, updates the progress file, leaves the environment clean/mergeable; counter "tendency to mark a feature as complete without proper testing" with end-to-end checks "as a human user would".
- **Compaction guidance (Anthropic context-engineering post):** Claude Code compaction preserves "architectural decisions, unresolved bugs, and implementation details"; "start by maximizing recall… then iterate to improve precision"; clearing old tool results is the safest first move; structured note-taking (NOTES.md) persists across resets; sub-agents get clean context and return condensed summaries. Claude Code's own guidance: "If you've corrected Claude more than twice on the same issue in one session… Run /clear and start fresh with a more specific prompt."
- **Staleness.** *Context Rot in AI-Assisted Software Development* (arXiv 2606.09090, 2026-06-08): a consistency checker over 356 repos found stale code-element references in 23.0% of CLAUDE.md/AGENTS.md files.
- **Practitioner patterns:** Beck's plan.md with unmarked tests; Dilger's `progress.txt` + "Codebase Patterns" at top; superpowers' plan ledger of `Ruling:` entries; Fowler's "decision record… is part of the implementation".

**Implications for the extension**
- Externalise state into files the harness re-injects: `plan.md` (slice list with status), `progress.md` (what was done, what remains, learnings), `decisions.md` (rulings + deviations). Treat these — not the transcript — as the source of truth; compaction must preserve them verbatim.
- Re-inject a compact **per-turn reminder** (current slice, its GWT, its Files list, the deviation protocol) at the end of context, where recall is best; keep it small.
- Hard-limit per-slice context: fresh sub-agent per slice with only its spec + interfaces (Anthropic sub-agent pattern; superpowers' "implementer sees only their own task"). Prefer *restart with state file* over *compact and continue* once a slice ends.
- Detect the "declare done" failure: a Stop hook that refuses completion while any plan item is unmarked or any test red.
- Run a staleness check on rule files (paths/commands referenced must exist) at session start.

### B3. Forcing explicit judgement instead of silent deviation

**Evidence**

- **Verification must be external to the actor.** Claude Code best practices: "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal"; gate ladder: in-prompt check → `/goal` condition re-checked each turn by a separate evaluator → Stop-hook deterministic gate → verification sub-agent ("fresh model try to refute the result, so the agent doing the work isn't the one grading it"); "Have Claude show evidence rather than asserting success."
- **External checklists beat self-critique** (arXiv 2607.17937 above: 10/10 vs 5/10).
- **Escalation channels redirect reward hacking** (*Can escalation channels redirect reward hacking toward defect disclosure?*, arXiv 2608.29460, 2026-08-29; 8 frontier models): providing an explicit escalation tool plus an anti-reward-hacking policy reduced reward hacking from 23.6% to 5.3% (OR 9.2), eliminated it for 6/8 models; 98.7% of escalations involved no hacking; defect detection +10.1pp. I.e., giving the model a *sanctioned way to say "this is wrong"* removes most silent gaming.
- **Cheating under impossible specs** (*ImpossibleBench*, arXiv 2510.20270, 2025-10-23): when spec and tests conflict, agents modify/delete tests or overload operators; rates depend on prompt, test access and feedback loop. Beck's warning sign "disabling or deleting tests" is the same phenomenon.
- **Authority forgery** (*The Troy Moment*, arXiv 2609.15494, 2026-09-14): models adjudicate conflicting authority inconsistently; compliance is "not well characterized as a property of a prompt or model in isolation" — the harness must define authority order.
- **Structured rulings instead of stalls** (obra/superpowers `skills/subagent-driven-development/SKILL.md` @ `8ca22db`): "The spec is the binding authority, the plan is its argument, and your judgment settles what neither answers. Record every decision in the ledger as `Ruling: <what you decided> — <why> — <what it costs if wrong>`, and keep going. A wrong ruling costs rework your human partner can see and undo; a session parked on a question costs their whole day." Only four hard stops: irreversible/destructive op, security-sensitive action, side effect outside the worktree (merge/push/publish), "plan so broken that every path forward is a guess".
- **Decision records as implementation** (Fowler, *Provenance Is the New Version Control*, 2026-01-13): record "chosen strategy, rejected alternatives, and the constraints that forced the choice".
- **Pre/post-conditions as contracts** (Beck, *Prose as a Programming Language*, 2026-05-26): `requires`/`ensures` on each unit of delegated work make deviation detectable.
- **Hooks that surface decisions:** Claude Code hooks (https://docs.claude.com/en/docs/claude-code/hooks, accessed 2026-10-06) — `PreToolUse` can return `permissionDecision: deny` with a reason that is shown to the model; `Stop` hooks can block with a message the model sees; `stop_hook_active` guards against infinite re-prompt loops; `PermissionRequest`/`Elicitation` events allow human confirmation.

**Implications for the extension**
- Define an explicit **authority order** (spec > plan > rule file > model judgement) and a **ruling format**: `Ruling: <decision> — <why> — <cost if wrong> — <alternatives rejected>`. Every deviation from the recommended default is a ruling; rulings are appended to `decisions.md` and summarised in the commit/PR.
- Provide a sanctioned **escalation tool/command** ("flag-spec-conflict", "request-human-decision") and instruct that using it is never penalised; evidence shows this slashes silent gaming.
- Make verification **adversarial and separate**: a fresh reviewer sub-agent with the GWT/spec and the diff, instructed to refute; the implementer must present evidence (test output, command transcripts), not claims.
- Replace "reflect on your work" with **copy-and-tick checklists** per gate, re-injected at the gate, not at session start.
- Deterministically block the known cheats: test file deletions, `.skip`/`xit`, assertion weakening, editing outside the task's Files list — with a deny reason that tells the model to file a ruling instead.

### B4. Advisory vs deterministic enforcement

**Evidence**

- **Vendor framing:** Claude Code: "Use hooks for actions that must happen every time with zero exceptions… Unlike CLAUDE.md instructions which are advisory, hooks are deterministic." Anthropic skills: low degrees of freedom (scripts) when operations are fragile, consistency is critical, or sequence matters; high freedom when multiple approaches are valid.
- **Prose is a write-only channel.** *When "Do Not" Is Not Deny* (arXiv 2608.23550, 2026-08-24; 481 CLAUDE.md files): only 4–16% of security "do not" rules had a matching built-in control (strict 4.4%) — "CLAUDE.md is a write-only channel".
- **Prose still has value as priming and as negative constraint** (arXiv 2604.11088), and rules naming a command/path move behaviour (arXiv 2610.04832).
- **Over-rigid gates fail in two ways:** (a) agents game verifiers when the gate is impossible or mis-specified (ImpossibleBench; Beck's genie "cheating"); (b) brittle checks produce stop-hook loops — Claude Code exposes `stop_hook_active` precisely because a blocking Stop hook "on a condition that will never resolve" is a known failure. Beck's TCR shows a *hard revert* gate is viable only when the unit of work is tiny.
- **Hybrid patterns observed:** superpowers' "rulings, not stalls" (soft gate with recorded override, hard stop only for four irreversible classes); Kiro "Quick Spec… without approval gates" vs standard specs with approval per phase; spec-kit "constitution" (prose principles) plus `/speckit-converge` loop (mechanical convergence check); Dilger's loop: hard `build && test` before commit, soft "append learnings".
- **Escalation as the override channel** (arXiv 2608.29460): the hybrid that measurably works is *hard policy + sanctioned escape hatch*.

**Implications for the extension**
- Use **deterministic hooks** for: tests green before commit; structural/behavioural commit tagging; forbidden file edits (tests deleted, outside-scope paths); secrets; destructive git; "plan has unmarked items" at Stop. Use **prose** for: design judgement (types first, ≥2 solutions, DS component reuse), framed as negative constraints with rationale.
- Implement **soft gates with recorded override** as the default middle tier: the hook blocks, the deny reason says "either fix X or record a ruling with `<command>`", and a recorded ruling unlocks the gate for that instance. The override itself is logged with who/why/cost.
- Keep hard gates **small, fast, and deterministic** (lint/test/path checks), never LLM-judged; use LLM judges only in advisory reviewer roles.
- Guard against gate loops: cap retries per gate (superpowers uses R≤3 resume, R≥4 fresh implementer on a stronger model), then escalate to human.
- Reserve **human confirmation** for superpowers' four classes (irreversible, security, out-of-worktree side effects, broken plan) to avoid approval fatigue.

### B5. Weaker implementer under a stronger planner

**Evidence**

- **Plan contents that worked (obra/superpowers `skills/writing-plans/SKILL.md` @ `8ca22db`):** plan written for "an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing". File structure first ("decomposition decisions get locked in"). **Task right-sizing:** "the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate… split only where a reviewer could meaningfully reject one task while approving its neighbor". Each step = one action with a checkable result (write failing test / run → fail / implement minimal / run → pass / commit). Header: Goal, Architecture, Tech Stack, Spec path, Global Constraints (verbatim values), Review Focus (uncovered failure modes). Per task: Files (Create/Modify `path:lines`/Test), Interfaces (Consumes/Produces exact signatures — "A task's implementer sees only their own task"), `Run:`/`Expected:`. "A plan is the set of decisions the implementer cannot make alone. A plan longer than the code it describes has written the code instead." Forbidden: "TBD", "handle edge cases". Self-review: spec coverage, step scan, type consistency, review focus, proportion. Handoff modes: subagent-driven (fresh implementer + fresh reviewer per task) vs native inline with one final reviewer "on the most capable model".
- **Beck's plan.md protocol** (2025-06-25): plan is a list of unmarked tests; "find the next unmarked test… implement only enough code to make that test pass."
- **Anthropic long-running harness** (2025-11-26): feature list JSON with pass/fail per feature; one feature per session; progress file; end-to-end verification "as a human user would".
- **Dilger's loop:** one slice per iteration; "Do not read the entire code base"; slice JSON is the truth; `build && test` gate; learnings appended.
- **Empirical:** *Probe-and-Refine Tuning* (arXiv 2606.20512, 2026-06-18): a 35B model on SWE-bench Verified went 25.5% unguided → 28.3% static guidance → 33.0% with refined guidance; the gain came from *coverage* (reaching the correct file) — i.e., telling a weaker model *where* matters most. *Agent Skill Evolution* (2610.04832): rules naming commands/paths are what move behaviour. *Exploratory Study of Agent Plans* (arXiv 2608.04661, 2026-08-05; 85 plan files): real plans contain steps, concrete files/locations, and testing info. Anthropic's "Test with all models" guidance: Haiku needs more guidance, Opus less.
- **Context budget for the implementer** (arXiv 2607.17937): small clean contexts (~11k chars) pass 8/10; large contexts 3/10 regardless of relevance.

**Implications for the extension**
- Plan format for Sonnet/Haiku-class implementers (mandatory fields): slice name; spec reference (GWT rows); exact Files to create/modify (paths); Interfaces consumed/produced as type signatures; the first failing test (verbatim or near-verbatim); `Run:` command and `Expected:` output; Global Constraints with literal values; explicit non-goals ("do not touch X"). No "TBD".
- Granularity: one slice = one test cycle = one reviewable commit; planner must split until a reviewer could reject one task while accepting its neighbour.
- Give the implementer **only** its task + interfaces + the always-on core rules; never the full plan or codebase. Verification is done by a separate reviewer (stronger model for final review).
- The implementer may not change the spec or plan; conflicts go to the escalation channel and become planner rulings.
- Keep a per-slice retry budget; after N failures, re-plan on the stronger model rather than letting the weaker model improvise.

### B6. Notable open-source agent "development systems"

(All inspected 2026-10-06 via gh api / README; star counts as of that date.)

- **obra/superpowers** (Jesse Vincent, MIT, ~296k stars; `pi install git:github.com/obra/superpowers`; https://github.com/obra/superpowers, announcement https://blog.fsck.com/2025/10/09/superpowers/). *Does well:* most complete skill-based SDLC (brainstorm → worktree → plan → subagent-driven dev → TDD → review → finish); "Mandatory workflows, not suggestions"; "Evidence over claims"; rulings ledger; precise plan format; skill evals. *Weaker:* no product-discovery/outcome layer (starts at "brainstorming"); TDD is unit-centric, no event-model/slice notion; enforcement is prose (no hooks).
- **GitHub spec-kit** (~140k stars; https://github.com/github/spec-kit). *Does well:* constitution once per project; `specify → plan → tasks → implement → converge` per feature; optional clarify/checklist/consistency-analysis gates; separate bug-fix and idea-assessment processes. *Weaker:* document-centric (spec/plan/tasks as prose), light on test-first and on decision recording; agent-agnostic so no deterministic enforcement.
- **BMAD-METHOD** (~54k stars; https://github.com/bmad-code-org/BMAD-METHOD). *Does well:* "decisions stay explicit, context carries forward, and the process sizes itself to the work"; role-perspective agents (PM, architect, UX, dev, QA); right-sized planning path; existing-codebase onboarding; BMad Loop for unattended epics. *Weaker:* heavy ceremony and persona role-play; large surface area; verification quality depends on prose discipline.
- **Kiro specs** (AWS; https://kiro.dev/docs/specs/). *Does well:* three artifacts `requirements.md` / `design.md` / `tasks.md`; approval gate per phase (or "Quick Spec… without approval gates"); dependency-graph task waves; bug-fix spec variant with current/expected/unchanged behaviour. *Weaker:* IDE-coupled; requirements are user stories (Dilger's "compresses a whole business process into a paragraph" critique applies).
- **Anthropic Claude Code skills/hooks** (docs.claude.com). *Does well:* reference implementation of progressive disclosure; rich deterministic hook surface (`PreToolUse` deny, `Stop` block, `PostCompact`, `SubagentStop`, `Elicitation`); sub-agents with isolated context. *Weaker:* no opinion about SDLC — it is the substrate, not the method.
- **Dilger/Nebulit event-modeling loop** (dilgerma repos; eventmodelers.ai). *Does well:* machine-readable slice spec → GWT → generated decider tests; one slice per iteration; learnings compressed into AGENTS.md. *Weaker:* Kotlin/Axon + emmett specific; Ralph loop runs `--dangerously-skip-permissions` with no review stage; AGENTS.md growth unbounded.
- **Chad Fowler / Phoenix** (https://github.com/chad/phoenix; early-stage). *Does well:* "Spec → Clauses → Canonical Requirements → Implementation Units → Generated Code"; regenerate only affected units when a spec line changes; provenance-first. *Weaker:* research prototype; regeneration-only posture conflicts with "implementation remembers".
- **Not retrieved:** OpenAI "Harness Engineering" post (openai.com/index/harness-engineering/ is JS-gated to curl); Harper Reed's codegen workflow. Both are secondary to the above.

**Implications for the extension**
- Borrow: superpowers' plan format and rulings ledger; spec-kit's constitution + converge loop; BMAD's "process sizes itself to the work" (explicit mode selection); Kiro's per-phase approval with a recorded "quick" bypass; Dilger's machine-readable slice spec; Fowler's provenance record.
- Differentiate: none of the above has (a) a product-discovery/outcome layer (Cagan/Torres), (b) event-model slices as the planning unit, (c) types-first design gates, (d) deterministic soft-gates with recorded overrides. That combination is the gap this extension fills.

---

## Cross-cutting synthesis (for the design doc)

1. **Pipeline of defaults:** outcome + four-risk assessment (Cagan/Torres) → event model + completeness check (Dymitruk) → slice spec with GWT + types (Dilger/Wlaschin) → plan file sized for a junior implementer (superpowers/Beck) → one-test-at-a-time with structural/behavioural commits (Beck) → adversarial reviewer with the deletion test (Fowler) → delivery-quality checklist (Cagan).
2. **Three enforcement tiers:** deterministic hooks (tests, paths, commits, secrets, Stop-with-unmarked-items); soft gates with recorded override (design rules); human confirmation only for irreversible/security/out-of-worktree/broken-plan.
3. **The decision log is the product:** `Ruling: decision — why — cost if wrong — alternatives rejected`, appended to a committed `decisions.md`, surfaced in PRs; rule files carry rationale comments and are audited for growth and staleness.
4. **Context discipline:** small, clean, fresh contexts per slice; state in files not transcript; per-turn reminder at the end of context; copyable checklists at gates; test the skills on every target model.

## Uncertainties and gaps
- Book contents (Inspired/Empowered, Continuous Discovery Habits, DMMF, Understanding Eventsourcing, Passionate Programmer, Modern Software Engineering, Continuous Delivery) cited from publisher pages/TOCs and the authors' own posts, not full text.
- "Nexus" as a name for Dilger's approach was not found in any inspected source; may be a misremembering of Nebulit.
- arXiv findings are single studies (several 2026 preprints, not peer-reviewed); effect sizes vary by model and task — treat as directional.
- Star counts and page-modified dates reflect 2026-10-06.
