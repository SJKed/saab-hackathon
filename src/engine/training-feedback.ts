import type { ResourceAssignment } from "./allocation";

export function buildTrainingFeedback(
  operatorAssignments: ResourceAssignment[],
  advisorAssignments: ResourceAssignment[],
): string[] {
  const messages: string[] = [];

  if (advisorAssignments.length === 0) {
    if (operatorAssignments.length === 0) {
      messages.push("The AI advisor sees no immediate allied deployment requirement.");
    }
    return messages;
  }

  if (operatorAssignments.length === 0) {
    const topAdvice = advisorAssignments[0];
    messages.push(
      `Recommendation: ${topAdvice.resourceName} should ${topAdvice.mission} ${topAdvice.targetName} now.`,
    );
    messages.push("No operator deployment is active yet, so current threat demand may go unanswered.");
    return messages;
  }

  const matchedAssignments = operatorAssignments.filter((operatorAssignment) =>
    advisorAssignments.some(
      (advice) =>
        advice.resourceId === operatorAssignment.resourceId &&
        advice.targetId === operatorAssignment.targetId &&
        advice.mission === operatorAssignment.mission,
    ),
  );

  if (matchedAssignments.length > 0) {
    messages.push(
      `${matchedAssignments.length} operator command${matchedAssignments.length === 1 ? "" : "s"} match the AI recommendation set.`,
    );
  } else {
    const topAdvice = advisorAssignments[0];
    messages.push(
      `Advisor differs from the current operator plan. Highest-priority suggestion remains ${topAdvice.resourceName} -> ${topAdvice.targetName}.`,
    );
  }

  if (operatorAssignments.length < advisorAssignments.length) {
    messages.push(
      `The operator has committed fewer assets than the advisor bundle (${operatorAssignments.length}/${advisorAssignments.length}).`,
    );
  }

  return messages.slice(0, 4);
}
