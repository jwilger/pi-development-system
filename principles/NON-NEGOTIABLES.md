# Non-negotiables

Departing from any item below requires an explicit decision from the author
(John). Do not decide it yourself, do not route around it. If you believe a
departure is warranted: stop, say which item and why, and ask.

## 1. Never rewrite pushed history or force-push

Amend/rebase/reset of pushed refs, `--force*`, deleting shared branches. Because it destroys other people's basis for trust.

## 2. Never weaken verification to make a gate pass

Deleting, skipping or loosening tests; suppressing a lint; editing expected values to match output; `--no-verify`. Because a green gate must mean the same thing afterwards. (Changing a test because the *requirement* changed is a recorded departure, not this.)

## 3. Never claim something was verified, run, or green that was not

Because the record of evidence is the product. Evidence comes before claims.

## 4. Never push on a red trunk

Except a change whose purpose is fixing that failure. Because unrelated work on red hides the signal.

## 5. Never work around an unresolved gate

Stop the rejected operation; never use another writer or waiver to evade assessment. Recoverable automated uncertainty is not a prohibition, owner-policy decision, or request for human approval: inspect the specific missing evidence, supply the existing contract through the supported assessment path, and retry the normal gate only when justified. Do not request renewed approval for already-approved scope or mark a persistent goal blocked merely because an assessment is unresolved. Invalid model output and provider failure need bounded diagnostic recovery, not fabricated answers or infinite retries. After appropriate recovery, ask only for a concrete remaining owner decision or external intervention. Because a gate you can route around is not a gate, and uncertainty alone is not permission or a human blocker.

## 6. Never violate repo-local delivery policy

Delivery mode, protected branches, required reviews. Because the repo, not this tool, owns policy.

## 7. Never let secrets leave the machine without sanitisation

In commits, logs, eval cases, or subagent prompts. Because exfiltration is irreversible.

## 8. Never commit without a rationale-bearing Conventional Commit, or add AI attribution trailers

No `Co-Authored-By`, no `Generated-by`. Because the message is the durable why; attribution noise is not.

## 9. Never make an architecture-shaping decision without an ADR

New dependency class, boundary change, persistence model, public contract—not routine implementation. `ARCHITECTURE.md` is the authoritative, self-contained current architecture and architectural goals; code must conform to it, without ADR backlinks or delegated requirements. ADRs preserve context, decisions, rejected alternatives, consequences and reconsideration conditions, not competing current requirements. Do not retry rejected approaches without materially changed context.

Every ADR addition or premerge edit needs its corresponding substantive architecture update in the same commit. Each resulting main/trunk commit adds at most one ADR; other records may change in that commit only for status-only supersession by that new decision. Once merged, never otherwise edit, delete, rename or correct a record; create a replacement decision instead. Squash delivery must preserve these rules and required updates. Bootstrap sequentially: one decision, cumulative self-contained architecture, verification, independent semantic review, then its commit before introducing the next. Architecture intent must remain distinct from verified implementation and delivery. Because current requirements and decision history serve different purposes, and neither cosmetic edits nor file presence establish substantive correspondence.

## 10. Never ship model-visible instructions without an evidence check

Skills, prompts, Jev questions need a fixture or eval. Because effectiveness is eval-driven, not vibes.
