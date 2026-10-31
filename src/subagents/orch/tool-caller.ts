import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/** Facts supplied by the child runtime, never by model tool arguments. */
export interface InheritedToolCaller {
  readonly rootId: string;
  readonly threadPath: string;
  readonly parentPath: string | null;
  readonly agentType: string;
  readonly sessionFile: string | undefined;
  readonly attemptId: string;
}

export interface ExpectedInheritedReviewer {
  readonly rootId: string;
  readonly threadPath: string;
  readonly attemptId: string;
}

const expectedReviewers = new Map<string, ExpectedInheritedReviewer>();
const dispatchKey = (rootId: string, threadPath: string): string =>
  JSON.stringify([rootId, threadPath]);

/** Host-only dispatch issuance; no tool accepts these fields from model arguments. */
export function expectInheritedReviewer(
  rootId: string,
  threadPath: string,
): ExpectedInheritedReviewer {
  const expected = Object.freeze({ rootId, threadPath, attemptId: randomUUID() });
  expectedReviewers.set(dispatchKey(rootId, threadPath), expected);
  return expected;
}

/** A fresh independent reviewer runtime may claim a dispatch exactly once. */
export function claimInheritedReviewer(rootId: string, threadPath: string): string | undefined {
  const key = dispatchKey(rootId, threadPath);
  const expected = expectedReviewers.get(key);
  expectedReviewers.delete(key);
  return expected?.attemptId;
}

export function forgetInheritedReviewer(rootId: string, threadPath: string): void {
  expectedReviewers.delete(dispatchKey(rootId, threadPath));
}

const callers = new AsyncLocalStorage<InheritedToolCaller>();

export function inheritedToolCaller(): InheritedToolCaller | undefined {
  return callers.getStore();
}

export function runWithInheritedToolCaller<T>(caller: InheritedToolCaller, execute: () => T): T {
  return callers.run(Object.freeze({ ...caller }), execute);
}
