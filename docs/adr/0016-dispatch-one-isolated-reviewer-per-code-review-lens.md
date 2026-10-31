# 0016 — Dispatch one isolated reviewer per code-review lens

Status: proposed

## Context

A multi-lens task divides a reviewer's attention. The approved goal requires one fresh session for every selected code-review lens and complete aggregation before a round can count. Submission packets are already stored independently, but no durable record identifies which lenses must finish. Repository-guidance pending input has separate compatibility semantics (ADR 0012).

## Decision

Return an array of agent_spawn payloads, one per selected lens, with distinct paths, `wait: false`, identical scope and snapshot digest, and only that lens assigned. The coordinator launches every independent sibling before waiting for all of them. Use existing subagent infrastructure; product-planning lens review is unchanged.

Persist an optional dispatch manifest (round, range, diff digest, input identity, selected lenses) in ReviewState, independently of guidance input. New starts always write it. Record requires exactly one single-lens packet for each dispatched lens, refusing missing, duplicate, unexpected or multi-lens packets before severity adjustment or state mutation. Submission validation applies the same assignment constraint and checks the current input identity even without repository guidance, so an earlier reviewer cannot submit into a replacement dispatch. Only guidance-configured rounds retain input metadata for clean-streak accounting; legacy streak semantics do not change. Consume the manifest only after recording the complete round. Retain legacy state and direct-record compatibility when there is no dispatch manifest; do not invent selected lenses for historical rounds.

## Consequences

Partial results remain available for retry and cannot advance the round. Missing or failed sessions cannot be replaced with a coordinator's clean result. Restarted coordinators retain completeness requirements, even though spawn handoffs and submissions remain session-local. The returned payload is now an array even for one lens; callers and guidance must migrate together. No severity, selection, required-round, or delivery-policy changes.

## Alternatives

- Keep a multi-lens reviewer: violates the focus requirement.
- Keep expected lenses only in memory: loses completeness checks after session restoration.
- Reuse guidance-only pending identity for all starts: changes legacy clean-streak semantics and adds unrelated migration risk.

## Revisit when

The orchestrator supports automatic tool-owned fan-out/join or durable reviewer-result storage. Revisit the legacy direct-record path separately if compatibility is intentionally retired.
