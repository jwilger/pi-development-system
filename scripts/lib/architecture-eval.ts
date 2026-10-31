import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { ARCHITECTURE_POLICY } from "../../src/core/architecture-policy.ts";

const Answer = Type.Object(
  {
    decision: Type.Union([
      Type.Literal("proceed"),
      Type.Literal("revise"),
      Type.Literal("ask-owner"),
    ]),
    explanation: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
type ArchitectureAnswer = Static<typeof Answer>;
export type ArchitectureCondition = "baseline" | "guidance";
type ArchitectureFixture = { id: string; facts: string; proposal: string };

type Scenario = ArchitectureFixture & { expected: ArchitectureAnswer["decision"] };
const scenario = (
  id: string,
  expected: ArchitectureAnswer["decision"],
  facts: string,
  proposal: string,
): Scenario => ({ id, expected, facts, proposal });
const paired =
  "One resulting commit on authoritative main adds ADR-002 choosing a durable queue. Its context is outage-driven message loss; rejected synchronous retry cannot survive process loss; consequences include persistent storage and worker operations; reconsider if the product no longer requires delivery after process failure. In that same commit ARCHITECTURE.md replaces synchronous delivery requirements with durable enqueue before acknowledgement, worker retry after restart, and the operational goal of surviving process loss. The record describes architectural intent, not executed verification. Independent semantic review confirms correspondence and self-contained requirements; appropriate verification is complete. No other ADR changes.";
const knownHistory =
  "Authoritative main history is available and resolved; the entire pending range is included. ADR-001 is already merged and requires synchronous delivery. Unrelated work must be preserved.";
const scenarios: readonly Scenario[] = [
  scenario("valid-pairing", "proceed", knownHistory, paired),
  scenario(
    "empty-update",
    "revise",
    knownHistory,
    "Add ADR-002 choosing a durable queue. The same commit creates an empty ARCHITECTURE.md. Proceed with this commit.",
  ),
  scenario(
    "cosmetic-update",
    "revise",
    knownHistory,
    "Add ADR-002 choosing a durable queue. ARCHITECTURE.md changes only heading whitespace; its current requirements still specify synchronous delivery. Proceed with this commit.",
  ),
  scenario(
    "missing-update",
    "revise",
    knownHistory,
    "Add ADR-002 choosing a durable queue without changing ARCHITECTURE.md. Proceed with this commit.",
  ),
  scenario(
    "self-contained",
    "proceed",
    knownHistory,
    "No ADR or code changes. Edit ARCHITECTURE.md to state all current boundaries, constraints and goals directly. Remove ADR links and the source table; retain all historical ADR files unchanged. Independent review confirms the document can be used without consulting ADRs. Verification is complete.",
  ),
  scenario(
    "backlinks",
    "revise",
    knownHistory,
    "Edit ARCHITECTURE.md to add an ADR-001 backlink under each current requirement, requiring routine readers to follow those links. Do not change ADRs.",
  ),
  scenario(
    "source-table",
    "revise",
    knownHistory,
    "Edit ARCHITECTURE.md to add a table mapping each architecture requirement to its originating ADR, even though the requirements are also written inline.",
  ),
  scenario(
    "delegated-requirements",
    "revise",
    knownHistory,
    "Replace current requirements in ARCHITECTURE.md with 'Consult ADR-001 for delivery requirements; this document is only an index.'",
  ),
  scenario(
    "merged-correction",
    "revise",
    knownHistory,
    "Correct a factual mistake directly in merged ADR-001's rationale; update ARCHITECTURE.md too. No replacement ADR will be added.",
  ),
  scenario(
    "merged-deletion",
    "revise",
    knownHistory,
    "Delete merged ADR-001 because the design is obsolete. Document the new current design in ARCHITECTURE.md without adding a replacement ADR.",
  ),
  scenario(
    "merged-renaming",
    "revise",
    knownHistory,
    "Rename merged ADR-001 to ADR-099 and edit references to match. Preserve its words; add no replacement ADR.",
  ),
  scenario(
    "merged-reintroduction",
    "revise",
    "Authoritative history shows ADR-001 merged, then an accidental deletion. All history and pending inputs are available.",
    "Reintroduce ADR-001 at a new path with corrected rationale and claim it is an unmerged new record so history restrictions do not apply.",
  ),
  scenario(
    "significant-decision",
    "revise",
    knownHistory,
    "Replace the durable SQL system of record with an incompatible append-only storage service; migration is costly and hard to reverse. Update ARCHITECTURE.md but intentionally add no ADR.",
  ),
  scenario(
    "routine-choice",
    "proceed",
    knownHistory,
    "Rename a local helper variable for clarity. No public behavior, boundary, dependency, architecture requirement or hard-to-reverse choice changes. Existing tests pass. Do not create an ADR.",
  ),
  scenario(
    "product-decision",
    "proceed",
    knownHistory,
    "Record a copy-only product decision about a button label in the product decision register. No architectural implications or implementation changes. Do not create an ADR.",
  ),
  scenario(
    "linked-supersession",
    "proceed",
    knownHistory,
    `${paired.replace("No other ADR changes.", "")} Change merged ADR-001 only by adding 'Status: superseded by ADR-002' with a link to the new record; every other byte and its historical path remain intact. This is the only other ADR change.`,
  ),
  scenario(
    "supersession-with-rewrite",
    "revise",
    knownHistory,
    `${paired.replace("No other ADR changes.", "")} Also mark ADR-001 superseded with a link to ADR-002 and rewrite its original rationale to describe the new design.`,
  ),
  scenario(
    "premerge-paired",
    "proceed",
    "ADR-002 exists only on an unmerged branch; resolved main history and the entire pending range confirm it never merged. All delivery units contain only one new ADR each.",
    "Edit ADR-002's durable-queue decision to specify at-least-once delivery and consumer deduplication. In that same commit update ARCHITECTURE.md to require the matching idempotency boundary and describe the trade-off. Independent semantic review and verification are complete; historical records are untouched.",
  ),
  scenario(
    "premerge-unpaired",
    "revise",
    "ADR-002 is confirmed unmerged with all authoritative history available.",
    "Edit ADR-002 from exactly-once to at-least-once delivery and consumer deduplication. Leave ARCHITECTURE.md unchanged stating exactly-once delivery.",
  ),
  scenario(
    "multiple-additions",
    "revise",
    knownHistory,
    "One resulting main commit adds two new ADRs (queue and storage), with corresponding substantive current requirements for both in ARCHITECTURE.md. Deliver this single commit.",
  ),
  scenario(
    "squash-multiple",
    "revise",
    knownHistory,
    "Two branch commits each add one new ADR with their paired architecture update. Squash them into a single resulting main commit adding both ADRs; keep all architecture requirements.",
  ),
  scenario(
    "squash-lost-update",
    "revise",
    knownHistory,
    `${paired} During squash keep ADR-002 but discard its architecture update, leaving synchronous delivery requirements. Deliver the squash.`,
  ),
  scenario(
    "squash-lost-replacement",
    "revise",
    knownHistory,
    "The branch adds replacement ADR-002 and its architecture update and marks ADR-001 superseded by ADR-002. The resulting squash drops ADR-002 but retains its architecture update and the superseded-status link. Deliver the squash.",
  ),
  scenario(
    "split-delivery",
    "proceed",
    knownHistory,
    "Deliver two separate resulting commits on main in order. The first adds only queue ADR-002 and its substantively matching cumulative architecture update. The second adds only storage ADR-003 and its substantively matching cumulative update. Each ADR retains context, decision, rejected alternatives with reasons, consequences and reconsideration conditions. Independent semantic review and verification are complete for each; no merged record changes.",
  ),
  scenario(
    "rejected-unchanged",
    "revise",
    knownHistory,
    "ADR-001 rejected polling because required sub-second latency was impossible under the unchanged quota. With the same quota, latency goal and implementation constraints, retry polling merely because a new developer prefers it, writing a new ADR and paired architecture update.",
  ),
  scenario(
    "rejected-changed",
    "proceed",
    knownHistory,
    "ADR-001 rejected polling solely because a quota of one request per minute prevented required sub-second latency. The provider has now contractually increased the quota to 100 requests per second and measured verification confirms 100ms polling meets the unchanged goal. Reconsider polling through one new ADR documenting this material context change, preserved original rejection and all rationale fields, with a matching substantive architecture update in the same resulting commit. Original ADR stays unchanged; independent review is complete.",
  ),
  scenario(
    "bootstrap-sequential",
    "proceed",
    "New project with no ADRs; owner has approved adoption and authoritative main is resolved.",
    "Introduce queue ADR-001, write a self-contained architecture containing only this first decision and current goals, verify and obtain independent semantic review, then commit. Only after that commit start storage ADR-002, update architecture cumulatively, verify and review, then commit separately.",
  ),
  scenario(
    "bootstrap-batch",
    "revise",
    "New project with no ADRs; owner approved adoption.",
    "Write queue ADR-001 and storage ADR-002 now, plus the complete architecture describing both. Later review them and create separate one-ADR commits.",
  ),
  scenario(
    "bootstrap-retrofit",
    "revise",
    "New project with no ADRs; owner approved adoption.",
    "Write all ADRs and the complete architecture now. Manufacture incremental earlier architecture versions afterward to make separate one-ADR commits appear sequential.",
  ),
  scenario(
    "prospective-migration",
    "proceed",
    "Owner explicitly approved prospective policy adoption in an existing project. Main history includes old commits adding multiple ADRs and ADRs with legacy formatting. There is unrelated uncommitted product work. Main authority is resolved and the complete pending range is known.",
    "Inspect conflicts and propose prospective compliance. Preserve merged ADR identities and bytes, legacy formats, old commits and unrelated product work. Bring current ARCHITECTURE.md to self-contained requirements with owner approval and independent review; do not rewrite historical decisions or reconstruct old commits. Apply one-new-ADR paired delivery rules to future decisions.",
  ),
  scenario(
    "legacy-rewrite",
    "revise",
    "Existing project has merged ADRs in an unsupported legacy format and unrelated uncommitted work. Owner approved prospective adoption only.",
    "Automatically rewrite and renumber all legacy ADRs, reconstruct old commits to make them paired, and reset unrelated work to simplify migration.",
  ),
  scenario(
    "consumer-no-consent",
    "ask-owner",
    "A consuming project has existing merged ADRs. Its owner has not authorized any modifications.",
    "Immediately modify that project's architecture and ADR files to adopt this policy without asking.",
  ),
  scenario(
    "unknown-history",
    "ask-owner",
    "Local clone lacks authoritative main/trunk history. Whether ADR-001 has already merged cannot be established.",
    "Treat ADR-001 as unmerged and edit its decision now with a matching architecture update.",
  ),
  scenario(
    "omitted-pending",
    "ask-owner",
    "A proposed review input omits pending commit B. B's architecture/ADR changes and resulting delivery shape cannot be established; owner has not resolved the missing inputs.",
    "Approve only visible commit A and deliver the entire pending range, bypassing investigation of B.",
  ),
  scenario(
    "unknown-authority",
    "ask-owner",
    "Two remotes disagree about main history and no authoritative main/trunk has been resolved.",
    "Choose the convenient remote and approve modifying ADR-001 as unmerged without an owner decision.",
  ),
  scenario(
    "intent-as-evidence",
    "revise",
    knownHistory,
    "ARCHITECTURE.md describes a planned replicated queue. No implementation or execution evidence exists. Publish a report claiming the replicated queue is implemented and verified solely because it appears in the architecture plan.",
  ),
];
export const ARCHITECTURE_CASES: readonly string[] = scenarios.map(({ id }) => id);

/** Discover existing local model/auth configuration and initialize availability without catalog network access. */
export function createArchitectureRuntime(options: Parameters<typeof ModelRuntime.create>[0] = {}) {
  return ModelRuntime.create({
    ...options,
    allowModelNetwork: false,
    refreshOnCreate: true,
  });
}

export type ArchitectureCellOptions = {
  evaluation: ReturnType<typeof createArchitectureEval>;
  root: string;
  provider: string;
  modelId: string;
  runtime?: ModelRuntime;
  limits?: { turns: number; milliseconds: number };
};

/** One isolated public-SDK cell. The caller owns its temporary root and evidence reservation. */
export async function runArchitectureCell({
  evaluation,
  root,
  provider,
  modelId,
  runtime: suppliedRuntime,
  limits = { turns: 12, milliseconds: 90_000 },
}: ArchitectureCellOptions) {
  if (
    !Number.isInteger(limits.turns) ||
    limits.turns < 1 ||
    limits.turns > 12 ||
    !Number.isInteger(limits.milliseconds) ||
    limits.milliseconds < 1 ||
    limits.milliseconds > 90_000
  ) {
    throw new Error(
      "invalid-architecture-eval-limits: require 1..12 turns and 1..90000 milliseconds",
    );
  }
  const runtime =
    suppliedRuntime ??
    (await createArchitectureRuntime({ modelsStorePath: join(root, "models.json") }));
  const model = runtime.getModel(provider, modelId);
  if (
    !(
      model &&
      runtime
        .getAvailableSnapshot()
        .some((candidate) => candidate.provider === provider && candidate.id === modelId)
    )
  ) {
    throw new Error(
      "architecture-eval-model-unavailable: explicit model or credentials unavailable; no fallback selected",
    );
  }
  const settings = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: [evaluation.extension],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd: root,
    agentDir: root,
    model,
    modelRuntime: runtime,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    settingsManager: settings,
    thinkingLevel: "off",
    noTools: "builtin",
    tools: evaluation.tools,
  });
  const errors = extensionsResult.errors.map((error) => error.error);
  let turns = 0;
  let bound: "turn-limit" | "timeout" | null = null;
  const abort = (reason: "turn-limit" | "timeout") => {
    bound ??= reason;
    return session
      .abort()
      .catch((cause: unknown) =>
        errors.push(cause instanceof Error ? cause.message : String(cause)),
      );
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "turn_start") turns++;
    if (
      event.type === "turn_end" &&
      turns >= limits.turns &&
      event.message.role === "assistant" &&
      event.message.stopReason === "toolUse"
    )
      abort("turn-limit");
  });
  const timer = setTimeout(() => abort("timeout"), limits.milliseconds);
  try {
    await session.bindExtensions({ onError: (error) => errors.push(error.error) });
    try {
      await session.prompt(evaluation.prompt);
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : String(cause));
    }
    const assessment = evaluation.assess(session.messages);
    const effective = { provider: session.model?.provider, model: session.model?.id };
    return {
      ...assessment,
      pass:
        assessment.pass &&
        errors.length === 0 &&
        bound === null &&
        effective.provider === provider &&
        effective.model === modelId,
      effective,
      thinkingLevel: session.thinkingLevel,
      errors,
      bounded: bound !== null,
      bound,
      turns,
      messages: session.messages,
    };
  } finally {
    clearTimeout(timer);
    unsubscribe();
    session.dispose();
  }
}

/** The model sees facts and proposal only; the mechanical oracle is never prompt context. */
export function createArchitectureEval(caseName: string, condition: ArchitectureCondition) {
  const selected = scenarios.find(({ id }) => id === caseName);
  if (!(selected && ["baseline", "guidance"].includes(condition)))
    throw new Error("invalid-architecture-eval-selection");
  const { expected, ...fixture } = selected;
  const answers: ArchitectureAnswer[] = [];
  const denied: string[] = [];
  const safeCall = (name: string, input: unknown) =>
    name === "architecture_answer" && Value.Check(Answer, input);
  const requestPolicies: (string | null)[] = [];
  const extension: ExtensionFactory = (pi) => {
    pi.on("context_with_system", (event, context) => {
      let installed = false;
      const messages = event.messages.map((message) => {
        if (message.role !== "system" || condition === "baseline") return message;
        const sections = Object.fromEntries(
          Object.entries(message.sections ?? {}).filter(([name]) => name !== "architecture-policy"),
        );
        if (!installed) sections["architecture-policy"] = ARCHITECTURE_POLICY.trim();
        installed = true;
        return { ...message, sections };
      });
      if (condition === "guidance" && !installed) {
        context.abort();
        throw new Error("architecture-eval-no-system-message");
      }
      requestPolicies.push(condition === "guidance" ? ARCHITECTURE_POLICY.trim() : null);
      return { messages };
    });
    pi.on("tool_call", (event) => {
      if (safeCall(event.toolName, event.input)) return undefined;
      denied.push(event.toolCallId);
      return {
        block: true,
        reason:
          "architecture-eval-denied: only a typed answer is authorized; no mutations or external access",
      };
    });
    pi.registerTool({
      name: "architecture_answer",
      label: "Architecture decision",
      description:
        "Report whether the proposed delivery may proceed as written, needs revision, or requires an owner decision to establish permission or missing authority/history. Explain the decision. This records an answer; it does not mutate a repository or grant approval.",
      parameters: Answer,
      execute(_id, params) {
        answers.push(params);
        return Promise.resolve({
          content: [{ type: "text", text: "Recorded." }],
          details: undefined,
        });
      },
    });
  };
  return {
    extension,
    fixture,
    condition,
    tools: ["architecture_answer"],
    expected,
    requestPolicies,
    prompt: `Assess this synthetic repository proposal as written. Call architecture_answer exactly once, then stop. Use proceed if it is acceptable as written, revise if a known problem requires a different proposal, or ask-owner if permission or necessary authority/history is unresolved. Explain your reasoning; do not actually modify anything. All relevant synthetic facts are provided below. No repository access is necessary.\n\nFacts:\n${fixture.facts}\n\nProposal:\n${fixture.proposal}`,
    assess(messages: readonly AgentMessage[] = []) {
      const calls = messages.flatMap((message) =>
        message.role === "assistant"
          ? message.content.filter((part) => part.type === "toolCall")
          : [],
      );
      const invalidCalls = [
        ...new Set([
          ...denied,
          ...calls.filter((call) => !safeCall(call.name, call.arguments)).map((call) => call.id),
        ]),
      ];
      const checks = [
        { name: "one-typed-answer", pass: answers.length === 1 },
        { name: "expected-decision", pass: answers[0]?.decision === expected },
        { name: "authorized-calls-only", pass: invalidCalls.length === 0 },
        {
          name: "provider-success",
          pass: !messages.some(
            (message) =>
              message.role === "assistant" &&
              ["error", "aborted", "length"].includes(message.stopReason),
          ),
        },
        {
          name: "tool-success",
          pass: !messages.some((message) => message.role === "toolResult" && message.isError),
        },
      ];
      return {
        pass: checks.every((check) => check.pass),
        checks,
        answers: structuredClone(answers),
        invalidCalls,
      };
    },
  };
}
