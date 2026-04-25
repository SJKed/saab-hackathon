import { describe, expect, it } from "vitest";
import { scorePlannerCandidate } from "./objective";

describe("scorePlannerCandidate", () => {
  it("penalizes expensive options when prevented damage is equal", () => {
    const cheap = scorePlannerCandidate({
      expectedDamagePrevented: 12,
      expectedMissionCost: 4,
      reserveValuePreserved: 1,
      scarcityCost: 0.5,
      switchingCost: 0.5,
      targetCity: undefined,
    });
    const expensive = scorePlannerCandidate({
      expectedDamagePrevented: 12,
      expectedMissionCost: 22,
      reserveValuePreserved: 1,
      scarcityCost: 0.5,
      switchingCost: 0.5,
      targetCity: undefined,
    });
    expect(cheap).toBeGreaterThan(expensive);
  });
});
