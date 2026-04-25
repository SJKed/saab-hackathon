import type { ResourceAssignment } from "./allocation";

export type DecisionDelta = {
  label: "good" | "neutral" | "risky";
  message: string;
};

function averagePriority(assignments: ResourceAssignment[]): number {
  if (assignments.length === 0) {
    return 0;
  }
  return (
    assignments.reduce((total, assignment) => total + assignment.priorityScore, 0) /
    assignments.length
  );
}

export function evaluateDecisionDelta(
  operatorAssignments: ResourceAssignment[],
  advisorAssignments: ResourceAssignment[],
): DecisionDelta {
  if (operatorAssignments.length === 0) {
    return {
      label: "neutral",
      message: "No operator command issued yet. AI recommendations remain advisory.",
    };
  }

  const overlapCount = operatorAssignments.filter((operatorAssignment) =>
    advisorAssignments.some(
      (advisorAssignment) =>
        advisorAssignment.resourceId === operatorAssignment.resourceId &&
        advisorAssignment.targetId === operatorAssignment.targetId &&
        advisorAssignment.mission === operatorAssignment.mission,
    ),
  ).length;
  const overlapRatio = overlapCount / operatorAssignments.length;
  const operatorPriority = averagePriority(operatorAssignments);
  const advisorPriority = averagePriority(advisorAssignments);

  if (overlapRatio >= 0.6 || operatorPriority >= advisorPriority * 0.95) {
    return {
      label: "good",
      message:
        "Command impact is positive: operator plan aligns with high-priority threat handling.",
    };
  }

  if (overlapRatio >= 0.25 || operatorPriority >= advisorPriority * 0.75) {
    return {
      label: "neutral",
      message:
        "Command impact is mixed: partial alignment with AI priority ordering.",
    };
  }

  return {
    label: "risky",
    message:
      "Command impact is risky: assignments diverge from current highest-priority threats.",
  };
}
