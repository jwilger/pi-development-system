export type PullRequestRef = { readonly repository: string; readonly number: number };
export type CheckObservation = {
  readonly name: string;
  readonly headOid: string;
  readonly state: "success" | "pending" | "failure" | "unknown";
};
export type PullRequestObservation = {
  readonly ref: PullRequestRef;
  readonly url: string;
  readonly headOid: string;
  readonly base: string;
  readonly state: "open" | "closed" | "merged";
  readonly draft: boolean;
  readonly mergedAt: string | null;
  readonly mergeOid: string | null;
  readonly checks: readonly CheckObservation[];
};
export type DeliveryConditions = {
  readonly requireMerge?: boolean;
  readonly targetBase?: string;
  readonly requiredChecks?: readonly string[];
  readonly manualRequirements?: readonly string[];
};
export type ConditionState = "satisfied" | "pending" | "failed" | "blocked" | "unknown";
export type ConditionAssessment = {
  readonly ref: PullRequestRef;
  readonly name: string;
  readonly status: ConditionState;
  readonly message: string;
};
export type DeliveryAssessment = {
  readonly status: ConditionState | "unassessed";
  readonly observations: readonly PullRequestObservation[];
  readonly conditions: readonly ConditionAssessment[];
};

function assessCheck(observation: PullRequestObservation, name: string): ConditionAssessment {
  const checks = observation.checks.filter((check) => check.name === name);
  let status: ConditionState = "satisfied";
  let message = `All observations for check ${name} succeeded at the current head.`;
  if (!observation.headOid) {
    status = "unknown";
    message = `Current head is missing for check ${name}.`;
  } else if (checks.length === 0) {
    status = "unknown";
    message = `No observations for required check ${name}.`;
  } else if (checks.some((check) => check.headOid !== observation.headOid)) {
    status = "unknown";
    message = `Check ${name} has observations not bound to the current head.`;
  } else if (checks.some((check) => check.state === "unknown")) {
    status = "unknown";
    message = `Check ${name} has an unknown current-head state.`;
  } else if (checks.some((check) => check.state === "failure")) {
    status = "failed";
    message = `Check ${name} failed at the current head.`;
  } else if (checks.some((check) => check.state === "pending")) {
    status = "pending";
    message = `Check ${name} is pending at the current head.`;
  }
  return { ref: observation.ref, name, status, message };
}

function assessMerge(observation: PullRequestObservation): ConditionAssessment {
  let status: ConditionState = "pending";
  let message = "Pull request is open; merge is required.";
  if (observation.state === "merged") {
    if (observation.mergeOid && observation.mergedAt) {
      status = "satisfied";
      message = "Pull request is merged with a merge OID and merge timestamp.";
    } else {
      status = "unknown";
      message = "Merged pull request lacks a merge OID or merge timestamp.";
    }
  } else if (observation.state === "closed") {
    status = "failed";
    message = "Pull request is closed without a merge.";
  } else if (observation.draft) {
    status = "blocked";
    message = "Draft pull request cannot satisfy the merge requirement.";
  }
  return { ref: observation.ref, name: "merge", status, message };
}

export function assessDelivery(
  observations: readonly PullRequestObservation[],
  conditions: DeliveryConditions,
): DeliveryAssessment {
  const assessments: ConditionAssessment[] = [];
  for (const observation of observations) {
    if (conditions.requireMerge === true) {
      assessments.push(assessMerge(observation));
    }
    if (conditions.targetBase !== undefined) {
      const matches = observation.base === conditions.targetBase;
      assessments.push({
        ref: observation.ref,
        name: "base",
        status: matches ? "satisfied" : "failed",
        message: matches
          ? `Base matches required base ${conditions.targetBase}.`
          : `Base ${observation.base} does not match required base ${conditions.targetBase}.`,
      });
    }
    for (const name of conditions.requiredChecks ?? []) {
      assessments.push(assessCheck(observation, name));
    }
    for (const name of conditions.manualRequirements ?? []) {
      assessments.push({
        ref: observation.ref,
        name,
        status: "unknown",
        message: `Manual requirement ${name} is unsupported; human assessment is required.`,
      });
    }
  }
  const priority: readonly ConditionState[] = [
    "failed",
    "blocked",
    "unknown",
    "pending",
    "satisfied",
  ];
  const status =
    priority.find((state) => assessments.some((assessment) => assessment.status === state)) ??
    "unassessed";
  return { status, observations, conditions: assessments };
}
