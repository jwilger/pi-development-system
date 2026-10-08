# Changelog

Generated from the Conventional Commit history by `npm run changelog`, after the release commit; do not edit by hand.

## 0.88.0 - 2026-10-08

- **Features**
  - **review:** reviewers submit results through a typed tool (I9b) (`bc8a5cb`)

## 0.87.0 - 2026-10-08

- **Features**
  - **intake:** ask for the size only when Jev is unsure; cap the review count (`eee6747`)

## 0.86.0 - 2026-10-08

- **Features**
  - **planning:** lite event modelling - slice schema, validator, tool and skill (I10) (`289c50c`)

## 0.85.0 - 2026-10-08

- **Fixes**
  - **lifecycle:** move slices through reviewing, delivering and idle (`d94fb3b`)

## 0.84.0 - 2026-10-08

- **Features**
  - **planning:** product-planning skill, lens review, ADR tool and adr.missing gate (I9) (`8d5145d`)
- **Other**
  - tick I8b in the plan progress checklist (`545e31f`)

## 0.83.0 - 2026-10-07

- **Fixes**
  - **subagents:** stop writing the whole thread registry on every status change (`f9afeef`)

## 0.82.0 - 2026-10-07

- **Fixes**
  - **context:** stop the subagent prompt from forcing the whole system prompt (`4ee3fda`)

## 0.81.0 - 2026-10-07

- **Fixes**
  - **context:** close round-3 review findings on the cache redesign (`95380c8`)

## 0.80.0 - 2026-10-07

- **Fixes**
  - **context:** stop rewriting the cached prefix on every request (`e21a102`)

## 0.79.0 - 2026-10-07

- **Fixes**
  - keep the intent nudge out of the system prompt and fix review-round findings (`abe33b9`)

## 0.78.0 - 2026-10-07

- **Other**
  - add a verify script and say the slash commands are optional (`685c24a`)

## 0.77.0 - 2026-10-07

- **Features**
  - tell the agent to start a review when it calls a slice finished (`cff53e3`)

## 0.76.0 - 2026-10-07

- **Features**
  - nudge new work into intake from what the prompt says (`3818bf0`)

## 0.75.0 - 2026-10-07

- **Features**
  - give each tool the exposure its role calls for (`4ed147c`)

## 0.74.2 - 2026-10-07

- **Other**
  - plan I8b codemode and ambient activation (`9394152`)
  - prove guards and evidence hold for nested codemode calls (`6bf4871`)

## 0.74.1 - 2026-10-07

- **Other**
  - tick I8 in the plan progress checklist (`cd13f82`)

## 0.74.0 - 2026-10-07

- **Fixes**
  - make a symlinked work/items an error for list, not an empty backlog (`d762b86`)

## 0.73.0 - 2026-10-07

- **Fixes**
  - refuse to write through symlinks in the repo-files tracker (`3f0bb2c`)

## 0.72.0 - 2026-10-07

- **Fixes**
  - give non-Latin titles an item id instead of refusing them (`9c69f6d`)

## 0.71.0 - 2026-10-07

- **Fixes**
  - make begin-work a no-op when already implementing (`4a59568`)

## 0.70.0 - 2026-10-07

- **Fixes**
  - add the planning to implementing step and close placeholder gaps (`3ed7851`)

## 0.69.0 - 2026-10-07

- **Fixes**
  - treat lowercase tbd as a placeholder and describe plan hand-off in order (`716febe`)

## 0.68.0 - 2026-10-07

- **Fixes**
  - name record sections in task-check replies and review before starting a goal (`5d34817`)

## 0.67.0 - 2026-10-07

- **Fixes**
  - make the fix review waiver explicit and guard a mid-slice intake (`a875b81`)

## 0.66.0 - 2026-10-07

- **Fixes**
  - record the fix-without-review choice instead of switching the gate off (`81a71b6`)

## 0.65.0 - 2026-10-07

- **Fixes**
  - close the ninth I8 review round in the fix review gate and task parsing (`74cecda`)

## 0.64.0 - 2026-10-07

- **Fixes**
  - stop offering review as an extra for every fix (`2c5d7a6`)

## 0.63.0 - 2026-10-07

- **Fixes**
  - close the seventh I8 review round in code spans and comment separators (`4cce56a`)

## 0.62.0 - 2026-10-07

- **Fixes**
  - close the sixth I8 review round in comments, backtick spans and labels (`a09d043`)

## 0.61.0 - 2026-10-07

- **Fixes**
  - close the fifth I8 review round in fences, line breaks and the GitHub marker (`5c00957`)

## 0.60.0 - 2026-10-07

- **Fixes**
  - close the fourth I8 review round in task parsing and item files (`988e6de`)

## 0.59.0 - 2026-10-07

- **Fixes**
  - close the third I8 review round in the GitHub tracker and task checks (`27df1f6`)

## 0.58.0 - 2026-10-07

- **Fixes**
  - close the second I8 review round in the trackers and task parser (`e81d2fa`)

## 0.57.0 - 2026-10-07

- **Fixes**
  - close the I8 review findings in task records, intake and trackers (`2d4b960`)

## 0.56.0 - 2026-10-07

- **Features**
  - **planning:** add work-item trackers, the plan hand-off prompt and the intake skill (`7671836`)

## 0.55.0 - 2026-10-07

- **Features**
  - **planning:** parse task records and check they are ready for an implementer (`ee148b1`)

## 0.54.0 - 2026-10-07

- **Features**
  - **planning:** add /devsys-start and devsys\_intake to size work and open the first phase (`9286a01`)

## 0.53.0 - 2026-10-07

- **Fixes**
  - **ci:** bump to 0.53.0, the sizing modules add a minor-level public capability (`55ffa4b`)

## 0.52.2 - 2026-10-07

- **Features**
  - **planning:** size work and judge which planning artifacts it needs (`2ddd0b0`)

## 0.52.1 - 2026-10-07

- **Other**
  - pass github context to scripts through env instead of the shell text (`a798541`)

## 0.52.0 - 2026-10-07

- **Other**
  - leave untouched vendored files exactly as they were, and make suppression reasons true (`03555c1`)

## 0.51.2 - 2026-10-07

- **Fixes**
  - treat pi's own exit-status line as noise when judging a missing test script (`d2728b1`)
- **Other**
  - fail the lint gate on warnings and document the vendored ratchet (`c7044a4`)

## 0.51.1 - 2026-10-07

- **Other**
  - bring the vendored subagent code under strict typecheck and lint (`99d953a`)

## 0.51.0 - 2026-10-07

- **Fixes**
  - keep archive from dropping a thread that is still opening, and tighten four review findings (`e25c303`)

## 0.50.0 - 2026-10-07

- **Features**
  - gate the functional-core boundary with ast-grep rules (`f5dc8ff`)
- **Other**
  - move profile marker detection out of the functional core (`fb420b6`)

## 0.49.0 - 2026-10-07

- **Fixes**
  - archive finished threads safely and stop trusting a missing test script (`7ad9cb8`)

## 0.48.0 - 2026-10-07

- **Other**
  - ratchet the vendored subagents and make no-warnings a written rule (`739be12`)

## 0.47.0 - 2026-10-07

- **Other**
  - split the functions pi-lens flagged and exempt the shell lexers with reasons (`71cab84`)

## 0.46.1 - 2026-10-07

- **Other**
  - fix lint findings that were real and align pi-lens with biome (`2097d36`)

## 0.46.0 - 2026-10-07

- **Fixes**
  - close the old follow-up items that were still real (`f37d73f`)

## 0.45.2 - 2026-10-07

- **Other**
  - take markdownlint-cli2 from nix, not npm (`05196d8`)

## 0.45.1 - 2026-10-07

- **Other**
  - gate on knip and markdownlint (`43d6371`)
  - pin actions to commit SHAs and scope the Jev key (`15fd3f8`)

## 0.44.4 - 2026-10-07

- **Fixes**
  - render departures as second-level headings (`345a210`)
  - render departures as second-level headings (`3f9d689`)
- **Other**
  - drop exports that nothing imports (`3121f74`)

## 0.44.2 - 2026-10-07

- **Other**
  - make our own markdown pass markdownlint (`bc7c1bf`)

## 0.44.1 - 2026-10-07

- **Other**
  - build fake credentials at run time so secret scanners stay meaningful (`9fc5a75`)
  - enforce a strict biome rule set so lint findings are errors (`601d519`)

## 0.44.0 - 2026-10-07

- **Other**
  - **context:** remove the compaction resync (`241df25`)

## 0.43.0 - 2026-10-07

- **Other**
  - **review:** stop filing nits; fix them now or drop them (`2ba58d2`)

## 0.42.0 - 2026-10-07

- **Fixes**
  - **ci:** bump to 0.42.0 for the live-fixture runner change (`852ba7b`)
- **Other**
  - run live Jev fixtures by path instead of skipping them (`64284c5`)

## 0.41.0 - 2026-10-07

- **Fixes**
  - **subagents:** archive finished threads instead of blocking spawns at the cap (`4e23e23`)
- **Other**
  - tick I7 progress and log review round 8 nits (`cb5f675`)
  - **plan:** add I7b cleanup increment before I8 (`ed6ed85`)

## 0.40.0 - 2026-10-06

- **Fixes**
  - **context:** stop status summaries counting as questions; deliver resync without a turn (`bec6446`)

## 0.39.0 - 2026-10-06

- **Fixes**
  - **context:** treat a lead-in plus bare option list as a question to the user (`78361d9`)

## 0.38.2 - 2026-10-06

- **Other**
  - **context:** pin the review streak in the resync block and the per-run evidence reset (`809b13d`)

## 0.38.1 - 2026-10-06

- **Fixes**
  - **context:** tell Jev which command ran or file was touched (`7bac8f7`)

## 0.38.0 - 2026-10-06

- **Fixes**
  - **context:** judge piped test runs by their real status, stop re-flagging recorded scope growth (`8a1fee8`)

## 0.37.0 - 2026-10-06

- **Fixes**
  - **context:** redact tool output before trimming it, treat option lists and (y/n) as questions (`4cff638`)

## 0.36.1 - 2026-10-06

- **Fixes**
  - **context:** skip aborted turns, rank wanted model by best tier, pin the session cap (`7bb8a26`)

## 0.36.0 - 2026-10-06

- **Features**
  - **context:** resync state after compaction, advise on model tier, flag push cadence (`4eccb7d`)

## 0.35.0 - 2026-10-06

- **Features**
  - **context:** force one corrective turn on unverified claims or slice drift (`b86d847`)

## 0.34.1 - 2026-10-06

- **Features**
  - **jev:** judge unverified claims and slice drift at turn end (`8822911`)
- **Other**
  - tick I6 and log round-18 review nits (`0165da7`)

## 0.34.0 - 2026-10-06

- **Fixes**
  - **review:** tell the coordinator to pass the slice to record; count any-bullet nested findings (`ee78d73`)

## 0.33.0 - 2026-10-06

- **Fixes**
  - **review:** a packet without a Findings section is an error, not an empty round (`3731537`)

## 0.32.0 - 2026-10-06

- **Fixes**
  - **review:** parse the finding shapes real reviewers write (`343682b`)

## 0.31.0 - 2026-10-06

- **Fixes**
  - **review:** tell the reviewer how the verdict and an empty findings list are written (`47d35e6`)

## 0.30.0 - 2026-10-06

- **Fixes**
  - **review:** a staged decision log is not an edit made after review (`6da3038`)

## 0.29.0 - 2026-10-06

- **Fixes**
  - **review:** a departure recorded after review no longer makes the review stale (`098aabc`)

## 0.28.0 - 2026-10-06

- **Fixes**
  - **review:** say a non-HEAD review does not clear the commit gate; key paths containing ' b/' (`3550ae3`)

## 0.27.1 - 2026-10-06

- **Fixes**
  - **review:** the last file's digest no longer depends on its position in the diff (`b0c27f0`)

## 0.27.0 - 2026-10-06

- **Fixes**
  - **review:** point the reviewer at ls-files, ignore-submodules in the digest, document the re-roll refusal (`4f7aca3`)

## 0.26.0 - 2026-10-06

- **Fixes**
  - **review:** digest every changed path, refuse re-running a review on unfixed findings (`618526d`)

## 0.25.0 - 2026-10-06

- **Fixes**
  - **review:** read the diff under diff.mnemonicPrefix and tell record which range was reviewed (`5c1d217`)

## 0.24.0 - 2026-10-06

- **Fixes**
  - **review:** only commands up to the first commit can exempt it; re-staging in this directory counts (`0d68709`)

## 0.23.0 - 2026-10-06

- **Fixes**
  - **review:** staged-then-edited exemptions read parsed arguments, not message text (`539b1b6`)

## 0.22.0 - 2026-10-06

- **Fixes**
  - **review:** a timed-out git call is a failure, and only a real re-stage skips the staged-then-edited check (`7b1ed04`)

## 0.21.0 - 2026-10-06

- **Fixes**
  - **review:** read untracked names with -z, hash symlinks as git does, refuse a staged file edited after review (`9ae58c1`)

## 0.20.0 - 2026-10-06

- **Fixes**
  - **review:** digest the diff git prints under any user config, key quoted paths, cover the follow-up note (`1243891`)

## 0.19.0 - 2026-10-06

- **Features**
  - **review:** review tools, pre-commit review gate, skill and prompt (`4ceffe4`)
- **Fixes**
  - **review:** review untracked files, bind packets to their round and digest, never let Jev lower a counted finding (`a4788dd`)

## 0.18.0 - 2026-10-06

- **Features**
  - **review:** persist per-slice review state in session state (`8eae216`)

## 0.17.1 - 2026-10-06

- **Features**
  - **review:** review domain, packet parser and Jev lens/severity questions (`44a86c9`)
- **Other**
  - **plan:** tick I5 after a clean fresh review (`b4ce2a1`)

## 0.17.0 - 2026-10-06

- **Fixes**
  - **agents:** drop empty icon so the eight devsys agents load (`7da362a`)

## 0.16.0 - 2026-10-06

- **Other**
  - **subagents:** exercise the resume path for pinned threads directly (`b0ed0c5`)

## 0.15.0 - 2026-10-06

- **Fixes**
  - **subagents:** pins survive resume in use-current mode; empty scope is no scope (`aa8779d`)

## 0.14.0 - 2026-10-06

- **Fixes**
  - **subagents:** pins keep resumed models; release gate refuses NaN and rounds up (`7c35079`)

## 0.13.0 - 2026-10-06

- **Fixes**
  - **ci:** override the version gate's low-confidence minor bump for I5 (`08ca297`)
  - **release:** decide the semver bump from three narrow Jev questions (`5d7082d`)
  - **subagents:** honour model pins on resume and report them in agent\_status (`e576d16`)

## 0.12.0 - 2026-10-06

- **Features**
  - **subagents:** agent\_spawn accepts per-spawn model and thinkingLevel (`d7ebddb`)
  - **agents:** devsys advisor, implementer, reviewer and lens agents with model families (`3cdf3a2`)
  - **routing:** devsys\_route\_task recommends model and effort per task (`af62e30`)

## 0.11.0 - 2026-10-06

- **Features**
  - **subagents:** vendor pi-subagent-manager 0.14.0 into the package (`69f220f`)
- **Other**
  - record I4 completion and round 7 nits (`8280f3c`)

## 0.10.6 - 2026-10-06

- **Fixes**
  - **tdd:** anchor the inline-test module and treat newlines as masking status (`184c2c8`)

## 0.10.5 - 2026-10-06

- **Fixes**
  - **tdd:** decide the Rust inline-test exemption per edit, not per marker (`f57a347`)

## 0.10.4 - 2026-10-06

- **Fixes**
  - **tdd:** apply the masked-status check to pi's structured exit code (`fb18409`)

## 0.10.3 - 2026-10-06

- **Fixes**
  - **tdd:** recognise node's failure summary and Rust sibling test files (`31b4361`)

## 0.10.2 - 2026-10-06

- **Fixes**
  - **tdd:** close stacked-attribute bypass and tighten gate path/test handling (`ba4611e`)

## 0.10.1 - 2026-10-06

- **Fixes**
  - **tdd:** stop red-first and lint gates misfiring on real agent workflows (`27cc932`)

## 0.10.0 - 2026-10-06

- **Features**
  - **tdd:** add engineering skills, language profiles, red-first and lint-suppression gates (`36a1e12`)

## 0.9.0 - 2026-10-06

- **Fixes**
  - **ci:** record why the version gate doubted the 1aa1d6f patch bump (`4360ed3`)

## 0.8.11 - 2026-10-06

- **Fixes**
  - **state:** tolerate a stale context in the CI watch and document the red-trunk chain refusal (`1aa1d6f`)

## 0.8.10 - 2026-10-06

- **Fixes**
  - **gates:** refuse a combined commit-and-push on a red trunk (`f0f7c81`)

## 0.8.9 - 2026-10-06

- **Fixes**
  - **gates:** give each chained heredoc commit its own message body (`e204372`)

## 0.8.8 - 2026-10-06

- **Fixes**
  - **gates:** require a departure when a commit message is built by a substitution (`fc74d1c`)

## 0.8.7 - 2026-10-06

- **Fixes**
  - **gates:** flag opaque git only when the opaque segment mentions the subcommand (`0b6cc63`)

## 0.8.6 - 2026-10-06

- **Fixes**
  - **gates:** see pushes after heredoc bodies and diff what a staging commit will contain (`05a3037`)

## 0.8.5 - 2026-10-06

- **Fixes**
  - **gates:** ignore shell redirects when reading push targets and accept explanatory bullets (`ba601ad`)

## 0.8.4 - 2026-10-06

- **Fixes**
  - **gates:** check the staged diff, skip dry-run pushes and treat backtick prose as text (`96b67f6`)

## 0.8.3 - 2026-10-06

- **Fixes**
  - **gates:** read piped heredoc commit messages and fail closed on unreadable ones (`25644fe`)

## 0.8.2 - 2026-10-06

- **Fixes**
  - **gates:** close remaining commit and push guard bypasses (`3213cfd`)

## 0.8.1 - 2026-10-06

- **Fixes**
  - **gates:** resolve git through wrappers for push and commit guards (`cb88505`)

## 0.8.0 - 2026-10-06

- **Features**
  - **ci:** add /devsys-ci watch, CI status line and delivery-discipline skill (`8a70edf`)

## 0.7.0 - 2026-10-06

- **Features**
  - **gates:** add push guard for delivery mode and red-trunk pushes (`59e3f55`)

## 0.6.0 - 2026-10-06

- **Features**
  - **gates:** add commit guard for rationale, Conventional shape and AI trailers (`7a7bf34`)

## 0.5.0 - 2026-10-06

- **Features**
  - **config:** add /devsys-models command, devsys\_models tool and this repo's config (`1a6209d`)

## 0.4.0 - 2026-10-06

- **Features**
  - **config:** add per-project model matrix and .development-system.toml loader (`556b2c4`)
- **Other**
  - **decisions:** log I2 round-8 review nits (`13279bd`)

## 0.3.8 - 2026-10-06

- **Fixes**
  - **gates:** see commands after shell comments and escaped quotes (`692410e`)

## 0.3.7 - 2026-10-06

- **Other**
  - **gates:** split test-guard judge into small pure helpers (`2aefcbe`)

## 0.3.6 - 2026-10-06

- **Fixes**
  - **gates:** never crash a tool call when shell text confuses the parser (`3bfbc8d`)

## 0.3.5 - 2026-10-06

- **Fixes**
  - **gates:** make the test guard see what pi's edit tool applies and judge large files fully (`56c76b2`)

## 0.3.4 - 2026-10-06

- **Fixes**
  - **gates:** stop flagging ordinary code as skipped or commented-out tests (`96842d3`)

## 0.3.3 - 2026-10-06

- **Fixes**
  - **gates:** stop treating in-place test edits as deletions and close comment-out gaps (`6dc5f86`)

## 0.3.2 - 2026-10-06

- **Fixes**
  - **gates:** normalise guarded paths and parse multi-line shell like pi and the shell do (`83b370f`)

## 0.3.1 - 2026-10-06

- **Features**
  - **gates:** guard test weakening with Jev-judged motive and tests.weaken departures (`3f6635d`)
- **Fixes**
  - **gates:** close test-guard bypasses and keep state across reload (`89739d6`)

## 0.3.0 - 2026-10-06

- **Features**
  - **context:** append open departures as a cache-friendly context tail (`860d8c5`)
  - **jev:** wrap the host classifier with caching, timeout and typed errors (`97de3c4`)
  - **gates:** route unclassifiable shell commands to Jev before the hard stop (`f02fa27`)
- **Fixes**
  - **gates:** close git-intent bypasses and redact credentials in logs (`1e8236a`)
  - **gates:** classify command substitutions, abbreviated options and heredocs (`7a6f393`)
  - **gates:** respect comments, quotes and heredocs when classifying git commands (`ad57f86`)
- **Other**
  - **plan:** tick I1 tasks and note dogfooding of the departure tool (`7fb33c7`)
  - **plan:** tick I1 in the progress checklist (`c45f65b`)

## 0.2.0 - 2026-10-06

- **Features**
  - **extension:** enforce the git hard stop and register departure tools (`58d510a`)

## 0.1.3 - 2026-10-06

- **Features**
  - **core:** add departure domain with parse and markdown rendering (`6eeae68`)
  - **state:** append departures to the monthly decision log (`178684d`)
  - **gates:** add devsys\_record\_departure tool and gate registry (`121bc70`)
  - **core:** classify git commands for irreversible intent (`c7d610f`)
- **Other**
  - **plan:** mark I0 complete (`1c4c386`)
  - **decisions:** record npm publish race seen at the I0 release (`c5454a8`)

## 0.1.2 - 2026-10-06

- **Fixes**
  - **principles:** match non-negotiables 3 and 7 to synthesis section 6 (`3399a08`)
  - **state:** validate persisted departures field by field (`d670cab`)
  - **extension:** refresh the status line on every state update (`747895c`)
- **Other**
  - **harness:** let emit() override hasUI without invoking the getter (`b353f20`)

## 0.1.1 - 2026-10-06

- **Features**
  - **core:** add pure domain types (GateId, GateDecision, Phase, Sizing, DevsysState) (`44bc4d8`)
  - **state:** persist DevsysState as devsys-state session entries (`4c463e9`)
  - **context:** inject non-negotiables as a development-system prompt section (`4a9a6a1`)
  - **extension:** wire composition root, /devsys-status and status line (`f4d3cd9`)
- **Fixes**
  - **state:** validate persisted departures, refresh status on change, drop cast (`84f9f9c`)
- **Other**
  - add fake ExtensionAPI harness for gate and adapter tests (`25aeda5`)
  - add ADR template, initial ADRs and decision log (`1632b2a`)

## 0.1.0 - 2026-10-06

- **Other**
  - scope package to @jwilger and add npm trusted publishing workflow (`dc3819a`)
  - drop explicit provenance flag (automatic with trusted publishing) (`88e58a2`)
  - commit .envrc and load gitignored .envrc.local for per-developer secrets (`c40a625`)
  - add continuous-deployment gates, tooling and CI/CD workflow (`2b0782f`)
  - add research, synthesis and 12-increment implementation plan (`3fcd866`)
  - add pi package manifest, host-lib peer deps and src/extensions tooling (`02bbd7e`)

## 0.0.0 - 2026-10-06

- **Other**
  - initialize pi extension package with nix devshell (`1f6a94e`)
