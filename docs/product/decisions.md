# Adoption decision register

Revision 0.2. Goal approval authorized planning; proposed designs remain unapproved.

| ID | Decision | Rationale / evidence | Status |
| --- | --- | --- | --- |
| D1 | Issues hold descriptions/lifecycle; optional Project facts remain separate | Avoid duplicate authority and slice/work-item confusion | Retained proposal; ADR 0011 |
| D2 | Fixed five-state workflow and state-based universal queue | Owner clarified that repository owns operational workflow | Superseded/rejected; no mandatory replacement vocabulary |
| D3 | API order as priority and self-assignment as claim | These are local choices, not reusable guarantees | Superseded/rejected as universal policy |
| D4 | Explicit bounded versioned guidance snapshots | Fresh agents/reviewers must actually receive local workflow/concerns | Revised proposal; ADR 0012 |
| D5 | Slice closure is not PR/work-item delivery | Pushed branch/open PR is not proof of completion | Retained boundary; ADR 0013 |
| D6 | Mandatory machine-local PR ledger | Particular persistence design was not approved and need not be universal | Superseded/rejected |
| D7 | Main risk is usefulness without imposed policy or false delivery | Two contrasting workflows and adverse multi-PR/session tests can falsify the boundary | Revised test proposal, not adoption evidence |
| D8 | Exact rubrics, autonomy, factory rules and server policy remain downstream | Explicit request boundary | Owner-required boundary |
| D9 | Upstream primitives/skills; version-controlled local operational workflow | Clarified owner goal; hard stops still apply | Owner-required boundary, not detailed design approval |
| D10 | One discovery skill with define/discover/maintain paths | Reuse survey → owner decisions → reviewed artifacts → bounded pilot, not stations | Proposed |
| D11 | Raw optional Project capabilities through existing tool | No canonical state mapping/transition engine; explicit effects and honest concurrency | Proposed; ADR 0011 |
| D12 | Optional version-controlled per-item PR-reference manifest | Resume with reviewed project-owned references, not cached workflow state | Proposed; ADR 0013; owner approval specifically requested |
| D13 | Supported explicit delivery conditions guard devsys issue-close paths only | No universal merge requirement or false claim of external/manual enforcement | Proposed; ADR 0013 |

A material design change reopens the corresponding plan/ADR before implementation.
Prior product-lens packets reviewed revision 0.1; their verdicts are not current approval.
