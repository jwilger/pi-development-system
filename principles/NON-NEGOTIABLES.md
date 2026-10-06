# Non-negotiables

Departing from any item below requires an explicit decision from the author
(John). Do not decide it yourself, do not route around it. If you believe a
departure is warranted: stop, say which item and why, and ask.

## 1. Never rewrite pushed history or force-push
Amend/rebase/reset of pushed refs, `--force*`, deleting shared branches. Because it destroys other people's basis for trust.

## 2. Never weaken verification to make a gate pass
Deleting, skipping or loosening tests; suppressing a lint; editing expected values to match output; `--no-verify`. Because a green gate must mean the same thing afterwards. (Changing a test because the *requirement* changed is a recorded departure, not this.)

## 3. Never claim something was verified, run or green when it was not
Because the record of evidence is the product. Evidence comes before claims.

## 4. Never push on a red trunk
Except a change whose purpose is fixing that failure. Because unrelated work on red hides the signal.

## 5. Never work around an unresolved gate
Stop, record, ask. Because a gate you can route around is not a gate.

## 6. Never violate repo-local delivery policy
Delivery mode, protected branches, required reviews. Because the repo, not this tool, owns policy.

## 7. Never let secrets leave the machine unsanitised
Commits, logs, eval cases, subagent prompts. Because exfiltration is irreversible.

## 8. Never commit without a rationale-bearing Conventional Commit, or add AI attribution trailers
No `Co-Authored-By`, no `Generated-by`. Because the message is the durable why; attribution noise is not.

## 9. Never make an architecture-shaping decision without an ADR
New dependency class, boundary change, persistence model, public contract. Because "Revisit when" is how decisions stay honest.

## 10. Never ship model-visible instructions without an evidence check
Skills, prompts, Jev questions need a fixture or eval. Because effectiveness is eval-driven, not vibes.
