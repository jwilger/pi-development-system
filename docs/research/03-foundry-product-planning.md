# 03 — How Foundry is planned: product-planning practice in `10kr-00001-foundry`

Research report. Source: `/home/jwilger/src/10kr-00001-foundry/` (working tree, read 2026-10-04). All paths below are relative to that repo unless prefixed. Nothing was executed except read-only inspection of files; no tests or CLI commands were run.

## 1. What Foundry is

Foundry is a planned multi-tenant SaaS ("partially dark software factory") that helps teams plan a useful product via guided discovery and then turn a strictly structured, verifiable plan into correct software built largely by autonomous agents (`docs/product/mvp-brief.md` §Product direction; `docs/product/terminology.md` distinguishes *Foundry/Product* = the product being planned, *Foundry/Build* = the repo's own development process, and *customer software* = what Foundry eventually builds). As of `ARCHITECTURE.md` (dated 2026-10-02) there is **no application runtime**; the repo contains planning documents plus a standalone TypeScript Event Model authoring/validation/rendering toolchain (`tools/event-model/`). The repo is therefore a near-pure specimen of the author's planning method, dog-fooded on itself.

## 2. The product-planning process as practiced

### 2.1 Artifact sequence (observed, with dates)

| Step | Artifact | Path | Produced |
|---|---|---|---|
| 0 | Current-state evidence scan | `docs/product/current-state-evidence.md` | 2026-09-30 |
| 1 | Discovery interview → decision register | `docs/product/discovery-decisions.md` (D01–D75, Q01–Q25, F01–F20) | 2026-09-30 → 10-02 |
| 1' | MVP brief, revised per answer | `docs/product/mvp-brief.md` v0.7 → v0.15 | same window |
| 2 | Five-lens review (2 rounds + closure) | `docs/product/five-lens-review.md` | 2026-10-01/02 |
| 3 | Planning follow-ups register | `docs/product/planning-followups.md` (P01–P10 + buckets) | ongoing |
| 4 | Terminology | `docs/product/terminology.md` | ongoing |
| 5 | Workflow (journey) inventory | `docs/product/workflow-inventory.md` + `.json` (J01–J22, W01–W20 migration) | 2026-10-02 |
| 6 | Second five-lens review of the inventory restructuring | `docs/product/workflow-review/product-*-review.md`, `*-round2.md`, `README.md`, `migration-plan.md` | 2026-10-02/03 |
| 7 | GitHub backlog migration (22 parents, 198 subtasks) | `workflow-review/github-migration-receipt.json`, Project #1 | 2026-10-03 |
| 8 | Event model per journey (J01 first) | `docs/product/event-models/j01-install-sign-in.{json,md,plan.md,report.json,overview.svg}` + `j01-review/` | 2026-10-01 → 10-04 |
| ∥ | ADRs for Foundry/Build decisions | `docs/adr/0001–0010` | 2026-09-29 → 10-02 |

The sequence is **brief ⇄ decision register → lens review → follow-ups → journey inventory → lens review (again) → backlog → event model per journey → (future) UI design, architecture, construction**. ADRs sit beside this track and govern *how the repo itself is built*, not product behavior (see §5). No task-level "stories" exist; the unit of backlog is a *journey* parent Issue with nine methodology sub-issues (§2.6).

### 2.2 MVP brief — structure (`docs/product/mvp-brief.md`, v0.15, ~6K words)

- Header: *Context* label (which of the three Foundry senses applies), *Status* line with version history and links to decision register, five-lens review, planning-followups. Explicit disclaimer: "establishes a discovery baseline; does not authorize application implementation".
- Fixed section order: Product direction & strategic diagnosis (Rumelt-style diagnosis + hypotheses) → Customers/users/business outcomes → Starting context & current evidence → MVP experience & scope (table: six activities Discovery/Modeling/UI Design/Architecture/Development/QC × minimum capability × work product) → Planning outputs as construction inputs → Guided planning & evidence policy (three discovery responsibilities: customer problem, solution validation, measurable success with KPI/baseline/target/method/window/owner; "calculated documented risk" record format) → Event Modeling house conventions → Collaboration/identity/customer ownership → Readiness, autonomous construction, delivery → Quality control & factory improvement (Five Whys) → Validation & measurement (Risk × Validation approach × Evidence sought; Measure × Definition) → Strategic risks & potential pivots → Business case & open commercial questions → Outside MVP → Methodological grounding (explicit citations of Cagan, Torres, Pichler, Perri, Rumelt, Dymitruk/Dilger, Frost) → pointer to the journey inventory.
- The brief is the *single narrative*; everything that is a question, deferral or later-phase idea is pushed out to the register or follow-ups (decisions D57/D58 arose precisely from leakage in both directions).

### 2.3 Decision register — structure (`docs/product/discovery-decisions.md`, ~10K words)

- *Closure rules* section defines statuses: **Resolved** (John answered or accepted), **Deferred** (John postponed, or Codex assigned to a later phase under delegation D52 — must state authority, rationale, interim constraints, revisit point), **Open**. Key rule: "Deferring specification … does not defer the capability beyond MVP. Only an explicit scope decision does that." John owns SME judgments; Codex owns process/phase allocation.
- Tables: *Confirmed direction* D01–D75 (ID | Decision | Status, with supersession chains e.g. D33→D74, D06→D56); *Discovery question dispositions* Q01–Q25 (ID | Question | Status | Needed for closure); *Scheduling, conditional scope, exclusions* F01–F20 (ID | Item | Existing disposition | Rationale | Revisit detail — buckets: true exclusions, conditional, scheduled planning, open business, rejected cut).
- *Interview log*: dated bullets, each answer → "Recorded as Dnn", each causing a brief version bump. Stated working protocol: "update the documents after each answer, ask one next question, then yield the turn and wait."
- Every later artifact cites D/Q/F/P IDs; the register is the referential spine.

### 2.4 Planning follow-ups (`docs/product/planning-followups.md`)

- Purpose statement: "working home for questions, ideation, planning tasks whose details belong in modeling/UI design/architecture/pilot prep/commercial". Rule: "Scheduled planning work is not an MVP exclusion."
- Table P01–P10 (ID | Questions/work | Appropriate phase/completion point | Existing decision refs), e.g. P01 acceptance-example contracts for State View/Automation, P02 Let/And Not grammar, P03 planning-to-construction contracts, P06 Five Whys, P09 execution. Then buckets: conditional conveniences; pilot prep/validation; five-lens experiment refinements (R01–R06 dispositions); commercial investigation; future opportunities; Foundry/Build context; workflow-restructuring follow-ups (D67–D73 → P-items + GitHub).

### 2.5 Current-state evidence (`docs/product/current-state-evidence.md`)

Bounded Slack/Google Docs scan answering baseline questions, table *Question | Current-state evidence (permalinks) | Remaining product decision*, plus "Candidate implications to validate" and "Source freshness and limits" (fetch dates, doc modification times). Explicitly "evidence ≠ desired process".

### 2.6 Workflow/journey inventory (`docs/product/workflow-inventory.md` + `.json`)

- Acceptance test for a workflow: "does it tell the story of a user performing a set of actions to achieve an outcome?" (D67).
- Table J01–J22: ID + GitHub issue link | User and starting need | Actions | Outcome. Examples: J01 Install GitHub App & sign in (#249), J06 Decide what product/change to pursue, J08 Identify workflows, J09 Model one workflow, J15 Resolve consequential technical decision → ADR, J18 Hand off planning, J19 Deliver authorized workflow, J21 Correct defect, J22 Improve factory line.
- Migration table W01–W20 maps the previous 20 "feature-shaped" parents (180 methodology subtasks) to J destinations with supersede/reuse disposition; W01 alone had 17 slice/scenario groups and 53 examples that had to be preserved.
- Each journey carries **nine linked modeling steps** (from `workflow-review/migration-plan.md`): significant events; timeline; storyboard; commands; read models; responsibility swimlanes; concrete scenarios; completeness/connected-workflow consistency; **human approval of a specified model revision**. Modeling order: J01, J03, J04, J05 then J02.
- `workflow-inventory.json` is the machine crosswalk; `workflow-review/catalog-verification.json` recounts 22 journeys/20 parents/180 children/17 groups/53 examples with source hashes.

### 2.7 Cross-referencing conventions

- Stable ID families: D/Q/F (register), P (follow-ups), R (lens-review findings), J/W (journeys), ADR-NNNN, and inside models `slice.j01.*`, `example.j01.c12`, `assumption.j01.a02`, `question.j01.q01`, `revision.j01.0.6`.
- Every derived artifact states what it is *not*: "advisory", "not human approval", "not construction authorization". Approval is always "of a specific revision" and recorded with person/scope/revision (D35, terminology *Brief*: "approval is separate from drafting").
- Receipts (JSON) accompany anything an agent executed: migration receipt, legacy-dependency query receipt (400 queries, SHA-256-bound), review receipts.

## 3. The "lens review" technique

### 3.1 Mechanics (`docs/product/five-lens-review.md`, `workflow-review/README.md`, D59, D66)

- Five **fresh** subagents, one per lens: Cagan, Torres, Pichler, Perri, Rumelt. Explicit framing everywhere: "AI reviewers, not those authors … simulated advisory perspectives, not reviews by those people or customer evidence."
- **Round 1 (independent)**: each reads the repo read-only, writes only its own report, no peer reports. **Round 2 (peer exchange)**: each receives all five reports and writes an amendment/consolidation/prioritization. **Parent synthesis**: coordinator merges into a findings table and an interview agenda. **Closure review**: five *new* agents judge the accepted revision (v0.14) and must each say whether to close.
- Guardrail quoted in five-lens-review.md: "Agreement among agents is useful critique, not independent customer evidence."

### 3.2 What each lens checks (from the review reports and five-lens table)

| Lens | Distinct emphasis | Typical artifacts produced |
|---|---|---|
| Cagan | value/usability/feasibility/viability risks; external value evidence | contradiction hunting (caught D33 four-pattern vs brief three-pattern vs P01 → D74) |
| Torres | actual behavior & causal evidence; assumption tests; "acceptance details to retain during modeling" | outcome/opportunity framing, evidence gaps |
| Pichler | adoption circumstances; recurring planning-only value; users/needs/direction | tends to rate severity higher (P1 vs peers' P2) |
| Perri | net benefit/economics; outcomes over outputs | validation refinements, measurement wording |
| Rumelt | diagnosis quality; rival explanations; expert dependence; guiding policy ↔ coherent actions; "Boundaries that passed" | strategic-risk/pivot sections |

### 3.3 Report template (round 1, shared by all five in `workflow-review/product-*-review.md`)

H1 "Independent product review…" → disclaimer line (which lens, "not a review by Marty Cagan", "Independent round one: no peer reports read", "read-only; only this report was written") → **Sources actually inspected** (file list with line ranges; explicit list of what was *not* done: no customer research, no live GitHub, no feasibility test) → **Verdict** → **Prioritized findings** (P1/P2; IDs like T1, RUM-01; each with *Evidence* path:line, *Why it matters*, *Recommended change*, *Classification* such as "clarification not scope addition / no new human decision") → Scope clarifications vs commitments / Boundaries that passed → Risks to retain in existing phases → Acceptance details to retain during modeling → structural count check (recounts journeys/children) → `Route:` footer (model + reasoning effort, no delegation).

### 3.4 Round 2 template (`product-*-round2.md`)

Bold **Verdict** ("accept … advisory; not behavioral-model approval, implementation authorization, or proof of customer value") → **Verification of my findings** (numbered; resolved or not; e.g. re-parsed all 180 mappings) → **Peer reconciliation** (adopt peers' points; reclassify severity differences as "urgency not disagreement") → boundaries preserved → **Sources read for this round** → Route footer. README observation: "Reviewers agree on direction; differences in initial severity or preferred editorial remedy do not leave competing product choices." Reviews ran while the coordinator was concurrently editing files ("transient empty scenario mapping … corrected on final inspection").

### 3.5 Feedback into the brief

- Synthesis table R01–R06 (Finding + consequence | Recommendation | Source findings/convergence e.g. "Torres-1, Rumelt-1; all five selected") → **Interview agenda** (ordered questions, "ask one substantive question at a time") → John answers → D-items → brief version bump → **Parent disposition** → closure review. Rejected recommendations are recorded, not silently dropped (D60: John rejected R01 anecdote request; F06 rejected scope cut).
- Second application (journey inventory): findings table in `workflow-review/README.md` (e.g. J14 shared-component ancestry, W01 authority → J04/J05, J13 optional implementation branch, D33→D74 Translation supersession) each with its resolution; publication authorized by John "ship it" 2026-10-03.

## 4. Event modeling in practice

### 4.1 House conventions (brief §Event Modeling house conventions; D28–D33, D74)

- Three slice patterns: **State Change**, **State View**, **Automation** (the earlier fourth "Translation" pattern was dropped by D74 / ADR-0010; external info becomes command arguments with explicit source mappings).
- Every command example: `Given` (internal domain-event history only) → `And Not` → `When` (exactly one command with concrete arguments) → `Then` (business events **or** one typed error). `Let` bindings are concrete JSON (tagged alias terms, not strings). `And Not` omitted fields are wildcards. Example from the brief: `Let: x = 1234; y = "mistaken order"` / `Given: OrderPlaced{orderId: x}` / `And Not: OrderShipped{orderId: x}` / `When: CancelOrder{orderId: x, reason: y}` / `Then: OrderCancelled{orderId: x, reason: y}`.
- Technology neutral; EventCore only illustrative.

### 4.2 Canonical JSON shape (`docs/product/event-models/j01-install-sign-in.json`, schema 0.6.0, 777 KB)

Top-level keys (observed): `artifact_kind: "foundry.event_model"`, `schema_version`, `artifact_id`, `revision {id, parent_id, authored_at, authored_by_provenance_id}`, `title`, `purpose`, `workflow {id, context_id, title, slice_order…}`, `slices` (6; fields `id, title, pattern, context_id, depends_on_slice_ids, occurrence_order, edge_order, lineage_order, example_order, consideration_order, provenance_ids, dependency_boundary, business_label, actor`), `definition_order` + `definitions` (41; `id, semantic_key, context_id, kind, name, lane, fields, provenance_ids, observation, business_label`), `occurrences` (38; `definition_id, role, field_roles`), `edges` (35; `kind, from_occurrence_id, to_occurrence_id`), `lineage` (265; `edge_id, source, target, transformation, provenance_ids`), `examples` (48; `title, categories, steps{kind, let[], given[], when, then}, associated_ids, provenance_ids, presentation`), `considerations` (36; `category, disposition, example_ids, rationale`), `scenarios` (6; `relevant_slice_ids, associated_ids`), `assumptions` (5; `statement, materiality, status, accepted_by_provenance_id`), `questions` (3; `prompt, importance, status, answer, answered_by_provenance_id`), `provenance_order` + `provenance` (9 sources e.g. `source.mvp-brief`, `source.decisions`, `source.followups`; `kind, label, locator`), `screens`/`transitions` (empty — "archived semantic screen contracts unsupported"), `review_sections` (markdown blocks), `navigation` (4 flows; nodes/edges).
Design intent (ARCHITECTURE.md, ADR-0009): JSON is authoritative; stable IDs; explicit owner ordering arrays; provenance on everything; occurrence topology separated from definitions; field lineage separated from presentation.

### 4.3 Derived artifacts

- `j01-install-sign-in.md` (16K words, generated): header "PROPOSED — human approval pending; structural validation is not behavioral proof", semantic digest, links; §Validation boundaries (limitations + advisory diagnostics); §business contract & remaining architecture obligations (from `review_sections`); §Navigation and external interactions; §Structured workflow and revision; §Slice index; §Structured acceptance examples (per slice, per example C12…, each rendered Given/And Not/When/Then).
- `j01-install-sign-in.report.json`: `schema_version, structural: "valid", readiness: "proposed", semantic_digest, diagnostics[] {code, severity, instance_pointer, entity_id, message}, limitations[]`. Current diagnostics are all advisory: `DEPENDENCY_OBLIGATION_UNRESOLVED`, `READINESS_ASSUMPTION_PROPOSED`, `READINESS_QUESTION_OPEN`.
- `j01-install-sign-in.overview.svg` (1.4 MB): one SVG per workflow, scenarios stacked beneath slices, 250 px timeline cards / 360 px scenario cards, lane order automations top / commands+read models middle / events bottom, strict arrow-routing rules (ARCHITECTURE.md, `tools/event-model/rules.md`, `layout-baseline.json`).
- `j01-install-sign-in.plan.md` (118 words): human-facing status note for the *current proposed revision* — what changed, why, which prior IDs remain, link to review packet, "Human workflow approval remains pending".

### 4.4 Review packet and receipts (`j01-review/`)

- `README.md` = current human review packet summary (revision `revision.j01.0.6`, issue #249; what was removed/kept; "All 48 prior scenario IDs remain"; links to coverage audit, crosswalk, prior revision, packet, receipts, review-check). `acceptance-audit.md` = checklist that the nine methodology steps are covered and that earlier verdicts "are historical and cannot approve this revision".
- Each revision gets its own sub-directory (`prior-revision/`, `domain-events-refresh/`, `layout-refresh/`, `no-invented-journey/`) holding `packet/`, `coverage-audit.json`, `continuity.json`, `review-check.json`, `check.log`, prior canonical JSON — a full audit trail per revision.
- `packet/packet.json`: `version, model_digest, svg_digest, renderer_version, coverage {slices[], examples[], navigation[]}`; `images.json` records per-PNG tile hash + source SVG digest. `business-review.txt` instructs: "Open diagram.svg in a browser or use rendered screenshots. Do not inspect its source. SME/design must receive diagram images only; engineering freezes its diagram verdict before consulting technical/model.json."
- Four persona reviews (`docs/product/event-modeling-review.md`, `.agents/skills/event-modeling/references/review-protocol.md`): **SME** (images only; narrate actors/changes/consequences/recovery against accepted business requirements), **Design** (images only; data vs controls, navigation, loading/unknown/empty/error states), **Engineering** (images first, save diagram verdict, then JSON for missing contracts — JSON "must not retroactively improve the diagram verdict"), **Autonomous implementation agent** (JSON + images; check every command has G/AN/W/T regardless of initiator, external facts as concrete args with source mappings, explicit query selectors for subject-specific read models, two-subject cross-read test, per-source freshness, diagram parity). Each writes a markdown report (`business-final.report.md`, `design-final.md`, `engineering-final.md`, `autonomous-final.md`) opening with a bold frozen diagram verdict and a declaration of what was *not* consulted, plus a receipt JSON: `{version, persona, reviewer, model_digest, svg_digest, renderer_version, inspected{slices,examples,navigation}, materials[{path,sha256,kind,source_svg_digest}], diagram_verdict, diagram_verdict_before_json, specification_verdict, findings[{entity_ids,severity,observation}]}`.

### 4.5 Tooling (ADR-0009, ADR-0010, `justfile`, `tools/event-model/`)

- CLI `node tools/event-model/dist/src/cli.js {validate|render|review-packet|review-check|semantic-eval|eval-benchmark|check}`, wrapped by `just event-model-validate [--require-ready]`, `event-model-render`, `event-model-review-packet --chrome`, `event-model-review-check --receipts`, `event-model-semantic-eval [--live]`, `event-model-check *models` (lint + format + CLI). Sources: `tools/event-model/src/{validate,render,review,routing,navigation,canonical,contracts,capture,eval,cli,types}.ts`; schema under `tools/event-model/schema/`.
- Validator checks (error codes observed in `src/*.ts`): identity/reference integrity (`IDENTITY_DUPLICATE`, `REFERENCE_DANGLING`, `ORDER_INVALID`, `OWNERSHIP_INVALID`, `SEMANTIC_KEY_DUPLICATE`), topology (`TOPOLOGY_INVALID`, `EXAMPLE_TOPOLOGY_INVALID`, `DEFINITION_LANE_INVALID`), example consistency (`EXAMPLE_ALIAS_UNRESOLVED/DUPLICATE`, `EXAMPLE_NEGATIVE_CONTRADICTION`, `EXAMPLE_PAYLOAD_INVALID`, `EXAMPLE_SCOPE_*`, `EXAMPLE_PATTERN_INVALID`), lineage (`LINEAGE_MISSING/INVALID/TYPE_MISMATCH`, `FIELD_FLOW_INVALID`), observations/contributors/queries (`OBSERVATION_*`, `CONTRIBUTOR_*`, `QUERY_KEY_INVALID`), dependencies (`DEPENDENCY_BOUNDARY_MISSING`, `DEPENDENCY_UNWITNESSED`, `NEGATIVE_DEPENDENCY_MISSING`, `DEPENDENCY_OBLIGATION_UNRESOLVED`), navigation (`NAVIGATION_*`), human decisions (`HUMAN_DECISION_INVALID`), readiness (`READINESS_ASSUMPTION_PROPOSED`, `READINESS_QUESTION_OPEN`), review continuity (`CONTINUITY_INVALID`, `REVIEW_REFERENCE_INVALID`).
- Stated limits (report `limitations[]`, ADR-0009): "checker verifies declared-example consistency, not runtime query completeness or command business behavior"; readiness "is a declared-question and assumption check, not human model approval"; review-check "cannot prove reviewers actually inspected images". Optional Jev text-eval is advisory and never runs in ordinary checks (`--live`, `TYPESAFE_API_KEY`).
- Digest binding: RFC 8785 canonical JSON → SHA-256 `semantic_digest`; MD/SVG/report/receipts all carry it so staleness is detectable.

## 5. ADR practice (`docs/adr/0001–0010`, 3,390 words total)

- Numbering: `NNNN-kebab-title.md`, `# ADR-NNNN: Title`. Strict template in 0001–0008: `## Status` (Accepted) → `## Date` → `## Context` → `## Decision` → `## Consequences` (`### Positive` / `### Negative`) → `## Alternatives Considered` (one `###` per alternative with "Rejected because…") → `## Revisit when` → `## Related`. ADR-0009/0010 loosen it (prose Status such as "Accepted for the initial exploratory Foundry/Build tooling… ADR-0010 advances… to 0.6.0", flat consequences, 0009 adds `## Sources` with commit-pinned archive permalinks and D28–D33; 0010 drops Alternatives/Revisit).
- Scope of what got ADRs: **only Foundry/Build (developer environment, delivery, tooling) decisions** — system boundaries (0001), reproducible dev (0002), command surface (0003), standards (0004), GitHub delivery (0005), dependency updates (0006), local hooks & tiber-off (0007), GitHub MCP write approval (0008), canonical event-model JSON (0009), review tooling (0010). This matches `.development-system.toml` scopes `developer_environment` and `documentation`.
- What did **not** get ADRs: all product decisions (D01–D75 live in the register), scope/phase scheduling (F/P tables), review outcomes (R tables). ADR-0001 states application runtime/schema/deployment decisions "belong to the first application slice". Journey J15 ("Resolve consequential technical decision → ADR") shows ADRs are reserved for consequential technical decisions during architecture.
- Supersession style: partial ("supersedes only the two-hook decisions in ADR-0003 and ADR-0004", 0007). `ARCHITECTURE.md` is declared the authoritative current view; ADRs "retain historical rationale and may be superseded" and do not override it.

## 6. Terminology glossary (`docs/product/terminology.md`, plus terms used across docs)

- **Foundry/Product · Foundry/Build · customer software** — three senses, always labelled in doc headers.
- **Current state vs desired state** — evidence of today's process vs the designed process.
- **Factory / project factory line / factory tuning** — the autonomous construction pipeline, its per-project instance, and improvement of it (J22).
- **Brief** — the planning narrative; "approval is separate from drafting".
- **Customer-owned artifact vs Foundry internals** (D44 trade-secret boundary).
- **Deferred item** — scheduled to a later phase; *not* an exclusion.
- **Workflow / journey** — "journey through which a user achieves an observable goal incl. alternative outcomes".
- **Vertical slice** — "slice type describes behavior; factory status describes progress"; patterns State Change / State View / Automation.
- **Functional screen model**, **Target architecture**.
- **Ready for QC · Planning complete · Delivered (merged) · Released (customer-owned)** — status ladder.
- From modeling: **Given / And Not / When / Then / Let**, **material assumption**, **material question**, **readiness** (declared checks pass) ≠ **human approval** (of a specific revision) ≠ **construction authorization**; **proposed** status; **receipt**; **packet**; **digest**; **persona review** (SME/Design/Engineering/Autonomous); **lens** (Cagan/Torres/Pichler/Perri/Rumelt).
- From the register: **Resolved / Deferred / Open**, **calculated documented risk**, **Five Whys**.

## 7. What worked well vs friction

### Worked well (observed evidence)

- **ID-spine traceability**: every finding, decision, follow-up and model entity has a stable ID; lens reviewers could cite `path:line` and recount 180 mappings mechanically (`workflow-review/catalog-verification.json`).
- **Independent-then-exchange review** surfaced real contradictions: three lenses independently found the J13/J14 crosswalk gap; Cagan caught D33 vs brief vs P01 pattern-count inconsistency, which became D74 and ADR-0010's removal of the Translator type.
- **One-question-at-a-time interview with immediate document updates** produced a clean v0.7→v0.15 trail with every answer recorded as a D-item.
- **Status discipline** ("proposed", "advisory", "not approval") is applied uniformly, so no artifact over-claims.
- **Digest-bound derived artifacts and receipts** make staleness and partial inspection detectable (review-check verifies currency/coverage/restrictions).

### Friction / overhead (observed evidence)

- **Brief-review corrections** D55–D58: John's own read of the written brief found misframed team description, wrong timing boundary, later-phase ideation leaking into the brief, and the business case wrongly relocated — i.e., the agent over-edited between answers. D60 and F06 show the panel's top recommendation and a proposed scope cut being rejected by the human.
- **Backlog churn**: the first backlog (W01–W20, 20 parents, 180 subtasks) was feature-shaped and had to be entirely superseded by the journey-shaped J01–J22 (22 parents, 198 subtasks), closing 170 issues as not-planned (`workflow-inventory.md` migration table, `migration-plan.md`). Significant planning effort spent before the "workflow = story of a user" test (D67) existed.
- **Markdown-first event model failed**: W01 was written in Markdown, "lacked mechanical validation/graphical translation" (ADR-0009 context) and was redone as JSON; then schema 0.4.0 → 0.6.0 within two days (ADR-0010) because the diagram "obscured access observations/consequences/recovery".
- **Model revision churn**: J01 reached `revision.j01.0.6` with four review sub-directories; revision 0.6 exists to remove an *invented* "generic journey-return" slice (agents fabricated a GitHubJourneyReturn event with no provider basis — `plan.md`, `j01-review/README.md`). The skill text now says "do not invent policy to make validation pass", a lesson learned.
- **Heavy artifact weight**: J01 alone = 777 KB JSON, 238 KB generated MD, 1.4 MB SVG, 87 PNG tiles, 269 KB receipts — for one sign-in journey still awaiting human approval.
- **Review honesty gap acknowledged**: review-check "does not prove inspection honesty"; concurrent editing during reviews created transient false findings.
- **Planning work all still "proposed"**: as of 2026-10-04 no journey model is human-approved and no application code exists; the brief took ~3 days, inventory restructuring 2 days, J01 modeling ~4 days.
- `planning-followups.md` and the F-table are explicitly where "don't lose it but don't do it now" goes — evidence the author values a *parking lot* with revisit conditions over either dropping or inlining.

## 8. Implications for a pi extension

### Practices worth encoding as skills/commands

1. **Discovery interview loop** — one question at a time, answer → D-item → brief diff → yield. Needs: register file with Resolved/Deferred/Open rules, auto-ID allocation, brief version bump, interview log append.
2. **Brief template** with fixed section order and a mandatory "Status/Context/not-authorization" header; lint that rejects TODO/ideation (route to follow-ups) and keeps business case in place (D57/D58 lessons).
3. **Follow-ups register** (P-items) with "appropriate phase" and "revisit when" columns; rule text: deferral ≠ exclusion.
4. **Lens review command**: spawn N fresh persona subagents read-only, enforce round-1 template (Sources inspected / Verdict / Prioritized findings with path:line evidence / Classification / Route footer), then round-2 peer exchange, then synthesis table R-nn + interview agenda. Make persona set configurable (Cagan/Torres/Pichler/Perri/Rumelt default) and always stamp "advisory, not customer evidence".
5. **Journey inventory** with the D67 acceptance test and the nine-step methodology checklist per journey; optional forge sync producing receipts.
6. **Event model authoring**: house conventions (3 patterns, G/AN/W/T, Let as JSON, And Not wildcards), canonical JSON + digest, derived MD/report, validator with structural vs readiness vs material-question separation, and the four-persona packet/receipt protocol (images-only for SME/design; frozen verdict for engineering). The Foundry `tools/event-model` CLI and `.agents/skills/event-modeling/SKILL.md` + `references/review-protocol.md` are directly reusable designs.
7. **ADR command** using the strict 0001–0008 template (Status/Date/Context/Decision/Consequences ±/Alternatives/Revisit when/Related), reserved for Foundry/Build-style technical decisions; keep an authoritative `ARCHITECTURE.md` that ADRs don't override.
8. **Approval records** — a first-class "human approved revision X of artifact Y on date by person" record, separate from readiness and from drafting; everything else labelled proposed/advisory.
9. **Receipts** for any agent-executed bulk action (backlog migration, reviews), hash-bound to inputs.

### Minimal artifact set (inference)

`docs/product/brief.md` · `docs/product/decisions.md` (D/Q/F) · `docs/product/followups.md` (P) · `docs/product/terminology.md` · `docs/product/journeys.md` (J) · `docs/product/reviews/<topic>/{lens}-r1.md, {lens}-r2.md, README.md` (R) · `docs/product/event-models/<jNN>.{json,md,report.json,svg,plan.md}` + `<jNN>-review/{packet.json,receipts.json,README.md}` · `docs/adr/NNNN-*.md` · `ARCHITECTURE.md`. Everything else in Foundry (crosswalk JSONs, per-revision review directories, SVG tiles) is supporting evidence that a tool can regenerate.

### Cautions from the evidence

- Start journeys with the "story of a user" test *before* generating backlog, to avoid the W→J rewrite.
- Keep the first event-model schema small; Foundry's 0.6.0 (24 top-level keys, 60+ error codes) is heavy for a planning tool and produced multi-MB artifacts per journey.
- Build in the "do not invent policy to make validation pass → record a material question instead" rule; J01 rev 0.6 exists because an agent invented a slice.
- Expect the human to correct the agent's over-editing of the brief; make brief edits diff-visible per answer.

## Inspected vs not

Inspected: ARCHITECTURE.md, justfile, .development-system.toml, lefthook.yml, docs/adr/0001–0010, all docs/product/*.md, docs/product/workflow-review/*.md, event-models/j01 plan.md/md header/report.json/JSON structure, j01-review README/acceptance-audit/packet metadata/persona report heads, .agents/skills/event-modeling/SKILL.md and references/review-protocol.md, head of github-project-work/SKILL.md, tools/event-model file list and error-code identifiers. Not inspected: JSON schema files, validator logic in detail, SVG/PNG content, `.worktrees/*` beyond top-level listing (identical structure to main; no distinct READMEs), `workflow-inventory.json` body, round-2 reports other than Cagan in full.
