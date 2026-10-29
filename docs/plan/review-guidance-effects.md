# Review guidance behavior evidence

Approved adoption revision 0.2 / ADR0012; bounded S9 effect check, not a new workflow framework.

## RFX — Exercise real fresh-reviewer behavior

**Goal:** An isolated SDK reviewer receives actual reviewerTask output and submits a typed finding for a repository-only archive-count concern; harmless and conflicting-policy controls remain truthful.

**Files:** scripts/eval-review.ts, scripts/lib/review-eval.ts, test/context/review-eval.test.ts, evals/review/, docs/plan/review-guidance-effects.md

**Interfaces:** Export `createReviewEval(caseName:"concern"|"harmless"|"conflict",condition:"baseline"|"guidance")` returning the prompt/extension/tools/assessment needed by existing SDK evaluator pattern. Use actual reviewerTask, ReviewInput helper, createSubmissionStore and createSubmitReviewTool with a matching pending review. Sources are synthetic only; custom bash/read tools return bounded canned diff/source responses, deny everything else and record all attempted mutations, including malformed tool calls. No real child filesystem/shell/forge authority. Live CLI requires explicit provider/model/case/condition/output, uses isolated empty temp resource root and existing SDK ModelRuntime, retry disabled, <=12 turns/90sec, records effective model/thinking, all fixture/scorer/runner/guidance hashes, errors/failures and redacted transcript using existing serializer. Never overwrite evidence or reroll a failed cell. Three finite cases baseline+guidance once each: concern has a new active-record count that incorrectly includes archived records under local policy; harmless explicitly excludes archives; conflict local workflow says include while review concern says exclude. Assess actual typed packet path/line/severity/archive-count finding and identity acceptance; harmless must have no such false finding; conflict must request owner decision with no invented authority or clean approval. Baseline may pass; report actual outcome without claiming improvement. Ordinary tests script actual SDK calls offline, never live model. Reuse repository patterns, no dependency.

**First failing test:** New test/context/review-eval.test.ts drives actual offline SDK and proves a clean typed submission cannot pass the concern evaluator; initially fail on missing public evaluator export. Then positive typed finding must pass and be accepted by actual submit tool.

**Steps:**

1. Add the first public SDK test and retain RED before creating evaluator implementation.
2. Build the three synthetic cases and actual reviewerTask/typed-submit extension, keeping all child authority synthetic and all writes denied.
3. Add positive concern, harmless, conflict, wrong identity, malformed mutation, boundary/error and evidence-JSON controls through actual offline SDK traces.
4. Add explicit opt-in CLI with bounded SDK runtime/routing/provenance and exclusive evidence file creation; preserve existing discovery behavior unchanged.
5. Run offline targeted/type/lint/knip/Markdown; then exactly six live cells with explicit available openai/gpt-6.1-sol and record all actual outputs, no retries/tuning to pass.
6. Record actual evidence and concrete failures here; return without commit/push/intake/review/phase changes or edits outside Files.

**Run:** `node --experimental-transform-types --no-warnings --test test/context/review-eval.test.ts`; `npm run typecheck`; scoped `biome check`; `npm run lint:knip`; `npm run lint:md`; opt-in `node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case concern|harmless|conflict --condition baseline|guidance --output NEW_PATH` once per cell.

**Expected:** First test RED; offline controls pass afterward. Live results/effective provenance/failures retained honestly. Any failed candidate is a concrete blocker, not authorization for repeated prompt tuning; parent decides next action. No actual GitHub or downstream operations.

**Out of scope:** Existing src files, Elixir worker files, discovery evaluator refactor, README/package edits, general evaluator DSL, real shell/filesystem tools or workflow enforcement. Coordinator owns current production integration and final gates.

## RFX execution record

Scope: only the five approved evaluator/test/evidence/taskdoc locations; production S9 remains coordinator-owned. Before implementation, the falsifying check was an actual offline SDK clean typed submission passing the concern evaluator (or an unsafe/malformed tool attempt disappearing).

- RED command: `node --experimental-transform-types --no-warnings --test test/context/review-eval.test.ts`
- RED result: exit 1; 0 passed, 1 failed, `ERR_MODULE_NOT_FOUND` for `/home/jwilger/src/pi-development-system/scripts/lib/review-eval.ts`. This was run before creating the public evaluator implementation.

### Implementation and offline verification

Added the public evaluator and one-cell CLI, synthetic source/diff fixtures, real production reviewer task and pending-input identities, actual typed submit/store integration, owner questions that never grant approval, denial/counting of unknown or malformed attempts, and case-specific assessment. Offline tests use the actual SDK and scripted provider. Evidence serialization reuses `serializeDiscoveryEvidence`; no production/discovery files or dependencies were changed by this worker.

Commands and observed results:

- `node --experimental-transform-types --no-warnings --test test/context/review-eval.test.ts`: after RED, intermediate integration first exposed `Extension runtime not initialized. Action methods cannot be called during extension loading.` Using actual session-state `rebuildFrom` for the pending fixture fixed initialization without faking the submit API. Controls grew through 6/6, 8/8 and finally 10/10 passing tests; final preflight exit 0, 10 passed, 0 failed. The clean concern packet is accepted by the actual tool but fails only the case-result check. Positive concern passes in both conditions; harmless/conflict/wrong identity/line/severity/missing reads/provider errors/fabricated owner authority/malformed mutations/JSON redaction/CLI exclusivity have controls.
- `node_modules/.bin/biome check --write scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts`: exit 127 because this repository has no local Biome executable. Used the available PATH executable instead; no dependency installation.
- `biome check --write scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts`: formatting and lint feedback corrected in owned files; final exit 0, checked 3 files.
- `biome check --error-on-warnings scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts`: exit 0, checked 3 files, no fixes applied.
- `npm run typecheck`: initial owned duplicate-property and narrowed-type errors were corrected; final runs exit 1 only on coordinator-owned `test/core/review-flow.test.ts(202,19)` and `test/core/review-flow.test.ts(288,19)`: `error TS2304: Cannot find name 'GuidanceSnapshot'.` Those files were not edited by this worker.
- `npm run lint:knip`: exit 0.
- `npm run lint:md`: exit 0, 115 files, 0 issues before this appended record.

### Exactly six authorized attempts — preserved failures

The evaluator/scorer was frozen before these commands. Each command below was invoked once (independent output paths, in parallel), exited 1, and printed `{"pass":false,"output":"evals/review/CASE-CONDITION.json"}` with its matching path:

```sh
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case concern --condition baseline --output evals/review/concern-baseline.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case concern --condition guidance --output evals/review/concern-guidance.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case harmless --condition baseline --output evals/review/harmless-baseline.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case harmless --condition guidance --output evals/review/harmless-guidance.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case conflict --condition baseline --output evals/review/conflict-baseline.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case conflict --condition guidance --output evals/review/conflict-guidance.json
```

All six evidence files contain `pass:false`, `effective:null`, and `errors:["eval-model-unavailable: explicit model or credentials unavailable; no fallback selected"]`; all trace arrays are empty. Requested routing is `openai/gpt-6.1-sol`, thinking `off`; retry is disabled, bounds are 12 turns/90 seconds. Each retains the actual prompt, fixture/guidance/input identities and 11 source hashes. These are failed preflight attempts, **not observed live reviewer behavior**. No model inference or tool activity occurred, so neither concern effectiveness, harmless restraint, conflict owner escalation nor baseline improvement can be claimed. No reroll, alternate model, post-failure prompt/scorer tuning, real GitHub, or downstream operation occurred.

Concrete blocker found by read-only inspection: the new runner passes `refreshOnCreate:false` to `ModelRuntime.create` and immediately checks `getAvailableSnapshot()`. The installed SDK initializes that snapshot with an empty `available` list and normally populates it through the skipped refresh. Therefore this guard cannot establish the authorized model's availability; the generic failure is **not evidence of absent credentials or an unavailable model**. This is a runner-initialization defect, not a model decision or an observed conflict failure. Existing discovery CLI uses normal runtime initialization. The failed bytes and implementation remain unchanged; coordinator decision is needed before changing the frozen runner and authorizing any replacement live attempts. No additional live cells are authorized by this record.

Read-only evidence/source verification command (exit 0; all six retained failures and all 11 current source hashes matched for every file):

```sh
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
for (const name of ['concern','harmless','conflict']) for (const condition of ['baseline','guidance']) {
 const path=`evals/review/${name}-${condition}.json`;
 const e=JSON.parse(await readFile(path,'utf8'));
 assert.equal(e.pass,false); assert.equal(e.effective,null);
 assert.deepEqual(e.errors,['eval-model-unavailable: explicit model or credentials unavailable; no fallback selected']);
 assert.equal(Object.keys(e.hashes).length,11);
 for (const [source,hash] of Object.entries(e.hashes)) assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),hash,source);
 for (const field of ['reads','questions','submitted','packets','attemptedChanges']) assert.deepEqual(e.trace[field],[]);
 console.log(`${path}: preserved failure, 11 current source hashes match, no model/tool activity`);
}
JS
```

Owned changed paths: `scripts/eval-review.ts`, `scripts/lib/review-eval.ts`, `test/context/review-eval.test.ts`, `evals/review/protocol.md`, the six JSON files listed above, and this task document. Other pre-existing/concurrent working-tree changes were left untouched. No commits/push, package/README/production/workflow-phase changes, or delegation by this worker. Full suite/build and actual live reviewer behavior remain unverified; global typecheck has the separate coordinator-owned errors noted above.

Post-record check: `npm run lint:md` exited 0 again (115 files, 0 issues).

### Authorized runtime repair and corrected matrix

The coordinator subsequently authorized a test-first initialization repair, preservation of the original six files, and exactly six additional corrected-runtime cells at new paths. This supersedes the earlier pause, not the historical failure record. No original evidence was edited. The model-unavailable text in those original files remains labeled a runner error, not credential evidence.

Files for the repair: host-only `createReviewRuntime` in `scripts/lib/review-eval.ts`, its CLI caller in `scripts/eval-review.ts`, and the focused SDK regression in `test/context/review-eval.test.ts`. Extracting the original initialization first preserved the defect for RED. The regression installs an in-memory fake OpenAI credential, forbids `fetch`, and asserts the actual SDK's configured builtin is in the availability snapshot before the runner selection guard. Removing only `refreshOnCreate:false` restores normal SDK initialization, matching the existing discovery/Elixir runners; model-catalog network refresh remains disabled. No prompt/scorer/fixture/guidance changes were made.

- Runtime RED: `node --experimental-transform-types --no-warnings --test --test-name-pattern='runner initializes actual SDK availability' test/context/review-eval.test.ts` exited 1, 0 passed / 1 failed: `AssertionError [ERR_ASSERTION]: configured builtin must be available before runner's selection guard`, actual `false`, expected `true`.
- Runtime GREEN: `node --experimental-transform-types --no-warnings --test test/context/review-eval.test.ts` exited 0, 11 passed / 0 failed, including the actual SDK availability regression with zero fetch calls.
- `biome check --write scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts` exited 0, formatted the added test.
- `npm run typecheck` exited 0 after the coordinator repaired its missing `GuidanceSnapshot` import; no coordinator-owned file was edited by this worker.
- `npm run lint:knip` exited 0.
- `biome check --error-on-warnings scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts` exited 0, 3 files, no fixes.
- A read-only Node assertion compared all six current public evaluator prompts, fixtures, guidance snapshots and pending inputs to the original six JSONs: all unchanged before the new batch. The integrity command below repeats this check for both batches.

Exactly these six new commands ran once each, in parallel, after the repair and freeze:

```sh
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case concern --condition baseline --output evals/review/initialized-concern-baseline.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case concern --condition guidance --output evals/review/initialized-concern-guidance.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case harmless --condition baseline --output evals/review/initialized-harmless-baseline.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case harmless --condition guidance --output evals/review/initialized-harmless-guidance.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case conflict --condition baseline --output evals/review/initialized-conflict-baseline.json
node --experimental-transform-types --no-warnings scripts/eval-review.ts --provider openai --model gpt-6.1-sol --case conflict --condition guidance --output evals/review/initialized-conflict-guidance.json
```

| Case | Baseline | Guidance | Actual observations |
| --- | --- | --- | --- |
| Concern | exit 0, PASS, 5 turns | exit 0, PASS, 4 turns | Actual typed archive-count defect accepted at `src/count.ts:4`, blocking verdict in both |
| Harmless | exit 0, PASS, 6 turns | exit 0, PASS, 4 turns | Actual typed clean packet accepted with zero findings in both |
| Conflict | exit 1, FAIL, 7 turns | exit 1, FAIL, 5 turns | Actual cited owner question, pending response and accepted blocking unresolved-policy finding in both; raw scorer defects below |

Each printed its actual `{"pass":true|false,"output":"evals/review/initialized-CASE-CONDITION.json"}`. All six recorded effective `openai/gpt-6.1-sol`, thinking `low`, while requested thinking was `off` (SDK normalization, not an unreported requested setting). All have `errors:[]`, `bounded:false`, no attempted mutations, exactly one accepted typed packet, and matching current provenance hashes. No fallback, reroll, new inference after this batch, or post-observation evaluator tuning occurred. Baseline success is valid and does not demonstrate guidance improvement.

**Concrete remaining failures are in the frozen scorer, not missing conflict escalation:** both actual conflict runs call `ask_repository_owner` with `sources:["docs/workflow.md:1","docs/review.md:1"]`. The `owner-decision` check requires exact bare paths via `question.sources.includes(path)`, so it rejects those valid line-qualified citations in both runs. The guidance `case-result` also rejects a finding that says workflow requires the count but review forbids it, the contract is unresolved and an owner decision is needed; its literal `/conflict|contradict|disagree/i` test does not match that wording. The actual guidance finding is:

> For [{ archived: true }], activeCount returns 1 as required by docs/workflow.md but forbidden by docs/review.md, leaving the API contract unresolved; obtain an owner decision, then align this return and add a nonempty archived-record regression test to that decision.

That finding has severity `should-fix`, path `src/count.ts`, line 4, lens `api-contract`, with typed verdict `blocking`; its packet sources explicitly describe contradictory requirements. Baseline fails only `owner-decision`; guidance fails `owner-decision` and `case-result`. Every other check passes. Both preserve pending owner authority without clean approval or sandbox escape. Raw scores remain FAIL; no regrading or scorer changes conceal the false negatives. The scoped handback therefore includes these concrete evaluator defects for future work rather than claiming an all-pass matrix or rerunning candidates.

### Evidence integrity and final gates

`sha256sum -c` against the six original hashes captured before repair exited 0 (all six OK), proving byte-for-byte preservation. `sha256sum evals/review/initialized-*.json` recorded the new hashes. The complete evidence checksum set is:

```text
0e343c9e7f7d52c975d4498c5f0fae572095033c3fb8431643f9506aff337b4f  evals/review/concern-baseline.json
3717759520b1faceec4823d921511d4a2876c50272baf78300eb00e3e947e557  evals/review/concern-guidance.json
b27573ea6aaad304b72d5c474c780f2f3823107a1cbc0791dff6d3f114cf46cb  evals/review/conflict-baseline.json
307eeac0137ced06a6786d7f6c23472a1a91cf3d73ff912bb62219e80fe268d0  evals/review/conflict-guidance.json
f6ce8eec2adb2c34a2a7f57e5229c971ec25c7b412ff4bad95050959d18e21d7  evals/review/harmless-baseline.json
060eccf71621d51b9e86518d5917ba8e0c4851590a334a65d4da0f79a86548a4  evals/review/harmless-guidance.json
a091423c27a83d6d0f93a8dc23394bd1a79ad3488ca162cbcc80627d4f9d9ac4  evals/review/initialized-concern-baseline.json
aa0dc0400e713bf19cdc3c644a9336cdf700fd5da05a67edcfd42fb0541bb971  evals/review/initialized-concern-guidance.json
b36263bc1d48efd32fb6f236f205b976e1df46cf6bd68c95d45497997ed96387  evals/review/initialized-conflict-baseline.json
dd47ee180017bd2962d00fabc4285a4192ec177353c526e73a9e3c04a935edb0  evals/review/initialized-conflict-guidance.json
3697b896d41dac3b18ef619214eedc6c90b9bcd323ab4075adddc70fc881a8df  evals/review/initialized-harmless-baseline.json
41ea071f97d082a9e808cc1e35479cd51dac630cb8ef2f3da8f1fef7225e6cff  evals/review/initialized-harmless-guidance.json
```

Read-only actual provenance/content verification (exit 0, every initialized cell verified):

```sh
node --experimental-transform-types --no-warnings --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createReviewEval } from './scripts/lib/review-eval.ts';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for (const name of ['concern','harmless','conflict']) for (const condition of ['baseline','guidance']) {
 const path=`evals/review/initialized-${name}-${condition}.json`;
 const e=JSON.parse(await readFile(path,'utf8'));
 const old=JSON.parse(await readFile(`evals/review/${name}-${condition}.json`,'utf8'));
 const current=createReviewEval(name,condition);
 for (const field of ['prompt','fixture','guidance','input']) {
  assert.deepEqual(current[field],old[field],field);
  assert.deepEqual(e[field],old[field],field);
 }
 assert.equal(e.fixtureHash,hash(JSON.stringify(e.fixture)));
 assert.equal(e.guidanceHash,hash(JSON.stringify(e.guidance)));
 assert.equal(Object.keys(e.hashes).length,11);
 for (const [source,digest] of Object.entries(e.hashes)) assert.equal(hash(await readFile(source)),digest,source);
 assert.deepEqual(e.effective,{provider:'openai',model:'gpt-6.1-sol',thinkingLevel:'low'});
 assert.deepEqual(e.errors,[]); assert.equal(e.bounded,false);
 assert.ok(e.turns<12); assert.deepEqual(e.trace.attemptedChanges,[]);
 assert.deepEqual(e.trace.submitted,[{accepted:true,verdict:name==='harmless'?'no-blocking':'blocking'}]);
 assert.equal(e.pass,name!=='conflict');
 console.log(`${path}: hashes/current sources/unchanged inputs/actual selection and raw result verified`);
}
JS
```

Final gates after documentation and live evidence:

- `npm test`: exit 0, **1933 passed, 0 failed, 0 skipped**. Ordinary SDK tests remain offline; no live test command was run.
- `npm run typecheck && biome check --error-on-warnings scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts && npm run lint:knip && npm run lint:md`: exit 0 for all; scoped Biome checked 3 files, Markdown checked 118 files with 0 issues.

Added `evals/review/README.md` under the newly explicit authorization, explaining all 12 attempts, six actual inference runs, current raw outcomes, baseline validity, effective thinking, remaining scorer defects and scope/authority limits. Updated `evals/review/protocol.md` to distinguish the two authorized batches. No production, root README, package, workflow, downstream or other worker paths were written, and no commit/push was performed. There is no standalone build script; typecheck and the full test suite were run, while coordinator-specific release/build gates remain out of scope. The remaining risk is the frozen scorer's citation/paraphrase false negatives plus limited synthetic single-observation coverage, not unreported successful regrading.

### Authorized focused scorer repair and one offline reassessment

The coordinator subsequently authorized only the citation/contradictory-requirements scorer bug fix, retaining every prior assertion and strict negative, followed by exactly one offline reassessment of each unchanged initialized transcript. No new model inference was authorized or performed. This section supersedes the earlier frozen-scorer handback status without changing historical raw evidence.

Files: `scripts/lib/review-eval.ts` adds exact-path positive numeric line/ordered-range citation matching and recognizes the concrete required-by-workflow/forbidden-by-review unresolved owner finding; `test/context/review-eval.test.ts` adds actual SDK positive/negative controls without removing existing assertions. The owner question, both policies, substantive nonclean unresolved finding, pending identity, denied-mutation and no-invented-approval requirements remain. Unknown/lookalike paths, zero/negative/malformed/reversed/unsafe line suffixes are rejected in questions and packet-source entries. No prompt, fixture, guidance, expected-control requirement, production or skill change.

Test-first commands/results:

- `node --experimental-transform-types --no-warnings --test --test-name-pattern='conflict accepts exact|conflict citation canonicalization|concrete contradictory contract' test/context/review-eval.test.ts`: RED exit 1, 1 passed/2 failed. Valid `docs/workflow.md:1` owner citations failed `owner-decision`; old substring packet matching incorrectly accepted `docs/workflow.md.evil:1`. Existing safety negatives still passed.
- `node --experimental-transform-types --no-warnings --test --test-name-pattern='concrete required-by-workflow' test/context/review-eval.test.ts`: RED exit 1, 0 passed/1 failed. The exact actual unresolved owner summary failed only `case-result` with bare valid owner sources.
- `node --experimental-transform-types --no-warnings --test test/context/review-eval.test.ts`: GREEN exit 0, 15 passed/0 failed after the focused fix. Includes both conditions, valid bare/line/range citations, malformed/lookalike sources, actual concrete summary, missing question/source, clean conflict verdict, invented approval, wrong identity, nit severity and attempted writes.
- `biome check --write scripts/lib/review-eval.ts test/context/review-eval.test.ts`: exit 0, formatting fixed in the test only.

Added `evals/review/reassess.ts` as an explicit offline-only script, outside ordinary test discovery. It reserves NEW `reassessed-initialized-*` files exclusively; never edits originals. It verifies unchanged prompt/fixture/guidance/input, replays original assistant tool calls through the actual SDK scripted provider and real typed tool, then assesses the unchanged original transcript against the resulting typed state. Fetch is denied, and each report records zero model/live-provider inference calls and zero fetch calls. Reports contain original path/byte SHA256, original checks, current scorer/replay/serializer/harness/typed-tool hashes and derived checks/state. They are **derived offline reports, not new model evidence**.

Exactly once, ran `node --experimental-transform-types --no-warnings --test evals/review/reassess.ts`: exit 1, 4 passed/2 failed. All six reports were saved, including both failures. No second reassessment or subsequent scorer change occurred.

| Case | Baseline derived | Guidance derived | Remaining failed check |
| --- | --- | --- | --- |
| Concern | PASS | PASS | None |
| Harmless | PASS | PASS | None |
| Conflict | FAIL | FAIL | `case-result` in both |

**Concrete remaining blocker exposed by this once-only reassessment:** owner-decision now passes in both conflict transcripts. However, the stricter packet-source exact-entry matching introduced a further false negative: actual accepted production packets combine valid citations with prose/multiple citations in each sources entry. For example, guidance has `docs/workflow.md:1 and docs/review.md:1: contradictory include/exclude requirements with no precedence; requested owner decision, but owner unavailable and resolution pending.` The current matcher accepts only standalone path/line/range entries and rejects this valid combined entry. Both actual model runs still correctly asked owner, retained unresolved blocking findings and did not claim approval. This is a scorer-boundary defect, not model misbehavior. The focused tests do not yet cover combined/prose packet sources. The reports retain this failure instead of hiding it, changing another criterion or rerunning until pass. Raw conflict scores remain their historical FAIL values, and no guidance uplift is claimed.

Current scorer SHA256: `5c59a8c4adf4abf3bbb5046968abb8408b3628c6665fc9d03386471890800a9f`. Offline reassessment script SHA256: `32a5433e592e7946efba3bec0a2d19f7dd88245e1dd11ffe80cc912d889d7b05`.

`sha256sum evals/review/reassessed-*.json` (exit 0):

```text
a58c3b53f61efc03bc123a977cdef17087aeb91aab0a909890ba13ffdd734b34  evals/review/reassessed-initialized-concern-baseline.json
4c3ce5ae184cea0a2139f5ee77a5551513aa4fc761288e76bd9fe388630f6914  evals/review/reassessed-initialized-concern-guidance.json
dee0bc401298d12574b2ffaf392dd94a64bacee003c3a6121f5790cf00072660  evals/review/reassessed-initialized-conflict-baseline.json
29c57059512e42d4cd298d427a04f1b0a1e826a8ed5ffc38231a7d2c8be24d0a  evals/review/reassessed-initialized-conflict-guidance.json
95194a84819a559d0c5a4928409aa52d45eefdc2388491b281a8e4288effa1e0  evals/review/reassessed-initialized-harmless-baseline.json
bf33bf6b1b08da67a9e6002c4d33604db54f9c00c845a9f7aa5d01907246bdec  evals/review/reassessed-initialized-harmless-guidance.json
```

Read-only integrity/provenance command, exit 0: all 12 original files match their recorded pre-fix byte hashes; all six derived files link unchanged originals and current source hashes, record zero inference/fetch calls, and retain the observed 4-PASS/2-FAIL result. This checks evidence only, not another reassessment:

```sh
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const task=await readFile('docs/plan/review-guidance-effects.md','utf8');
const originals=[...task.matchAll(/^([a-f0-9]{64})  (evals\/review\/(?:initialized-)?(?:concern|harmless|conflict)-(?:baseline|guidance)\.json)$/gm)];
assert.equal(originals.length,12);
for (const [,digest,path] of originals) assert.equal(hash(await readFile(path)),digest,path);
console.log('12 original evidence files match their pre-fix byte hashes');
for (const name of ['concern','harmless','conflict']) for (const condition of ['baseline','guidance']) {
 const path=`evals/review/reassessed-initialized-${name}-${condition}.json`;
 const e=JSON.parse(await readFile(path,'utf8'));
 const originalBytes=await readFile(e.original.path,'utf8');
 const original=JSON.parse(originalBytes);
 assert.equal(e.original.sha256,hash(originalBytes));
 for (const [source,digest] of Object.entries(e.hashes)) assert.equal(hash(await readFile(source)),digest,source);
 assert.deepEqual(e.originalResult,{pass:original.pass,checks:original.checks});
 assert.equal(e.noInference.modelCalls,0); assert.equal(e.noInference.liveProviderCalls,0); assert.equal(e.fetchCalls,0);
 assert.deepEqual(e.replayErrors,[]); assert.deepEqual(e.trace.attemptedChanges,[]);
 assert.equal(e.pass,name!=='conflict');
 console.log(`${path}: provenance/no-inference verified; pass=${e.pass}; failing=${e.checks.filter(c=>!c.pass).map(c=>c.name).join(',')}`);
}
JS
```

Final gates after scorer repair (before this appended documentation):

- `npm test > /tmp/review-eval-final-tests.log 2>&1; result=$?; tail -14 /tmp/review-eval-final-tests.log; exit "$result"`: exit 0, 1937 passed/0 failed/0 skipped.
- `npm run typecheck`: exit 0.
- `biome check --error-on-warnings scripts/eval-review.ts scripts/lib/review-eval.ts test/context/review-eval.test.ts`: exit 0, checked 3 files, no fixes.
- `npm run lint:knip`: exit 0.
- `npm run lint:md`: exit 0, 118 files/0 issues.
- `node_modules/.bin/tsc --ignoreConfig --module nodenext --moduleResolution nodenext --target ES2023 --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --erasableSyntaxOnly --allowImportingTsExtensions --noEmit --skipLibCheck evals/review/reassess.ts`: exit 0. Explicitly checks this script because the repository tsconfig excludes evals.
- `biome check --write --stdin-file-path=test/context/review-reassessment.ts < evals/review/reassess.ts | cmp -s evals/review/reassess.ts -`: exit 0, processed output identical. The repository Biome include list excludes evals; stdin applies the existing test rules without changing config. Plain stdin non-write check unexpectedly reports unfixed content even when processed output is identical; the byte comparison plus TypeScript check is the recorded verification, not a claimed ordinary scoped lint of an excluded file.

Updated `evals/review/README.md` with raw versus derived results and the concrete remaining packet-source blocker. Added paths since the previous handback: `evals/review/reassess.ts` and six `evals/review/reassessed-initialized-*.json`. All other owned paths remain as previously listed. No production, root README, package, workflow/phase, downstream or other worker files were written; no new live calls, delegation, commits or pushes. Remaining work is the explicitly reported packet-source scorer boundary, not a hidden candidate failure or an all-pass claim.

Post-record verification: `npm run lint:md` exited 0 after the README/task record update (118 files, 0 issues).
