import { describe, expect, it } from "vitest";
import { evaluateDecisionDelta } from "./decision-delta";
import type { ResourceAssignment } from "./allocation";

function createAssignment(
  resourceId: string,
  targetId: string,
  priorityScore: number,
): ResourceAssignment {
  return {
    mission: "intercept",
    resourceId,
    resourceName: resourceId,
    targetId,
    targetName: targetId,
    distance: 10,
    threatScore: 1,
    priorityScore,
    reason: "test",
  };
}

describe("evaluateDecisionDelta", () => {
  it("returns neutral when no operator assignments exist", () => {
    const delta = evaluateDecisionDelta([], []);
    expect(delta.label).toBe("neutral");
  });

  it("returns good when operator assignments overlap strongly", () => {
    const operator = [createAssignment("a1", "t1", 9)];
    const advisor = [createAssignment("a1", "t1", 9)];
    const delta = evaluateDecisionDelta(operator, advisor);
    expect(delta.label).toBe("good");
  });

  it("returns risky when operator plan diverges from advisor", () => {
    const operator = [createAssignment("a1", "t1", 2)];
    const advisor = [createAssignment("a2", "t2", 9)];
    const delta = evaluateDecisionDelta(operator, advisor);
    expect(delta.label).toBe("risky");
  });
});
