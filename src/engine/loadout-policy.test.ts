import { describe, expect, it } from "vitest";
import { buildMissionWeightedInventory, getLoadoutPolicyRationale } from "./loadout-policy";
import type { ScenarioPreset } from "../models/scenario";

const scenario: ScenarioPreset = {
  id: "loadout-test",
  name: "Loadout",
  description: "",
  briefing: "",
  aggressionOverride: "pressure",
  objective: {
    minCitiesSurviving: 2,
    maxTicks: 300,
    maxCityLosses: 1,
  },
  seed: 44,
};

describe("loadout policy", () => {
  it("is deterministic for same inputs", () => {
    const first = buildMissionWeightedInventory("allied", scenario, 4, true, 1);
    const second = buildMissionWeightedInventory("allied", scenario, 4, true, 1);
    expect(first).toEqual(second);
  });

  it("responds to radar objective weighting", () => {
    const noRadar = buildMissionWeightedInventory("enemy", scenario, 4, false, 0);
    const withRadar = buildMissionWeightedInventory("enemy", scenario, 4, true, 0);
    expect(withRadar.ballisticMissile).toBeGreaterThanOrEqual(noRadar.ballisticMissile);
  });

  it("provides rationale text", () => {
    const rationale = getLoadoutPolicyRationale(scenario, true);
    expect(rationale.length).toBeGreaterThan(10);
    expect(rationale).toContain("horizon");
  });

  it("adapts composition for endurance horizon", () => {
    const shortScenario: ScenarioPreset = {
      ...scenario,
      objective: { ...scenario.objective, maxTicks: 180 },
      seed: 99,
    };
    const enduranceScenario: ScenarioPreset = {
      ...scenario,
      objective: { ...scenario.objective, maxTicks: 520 },
      seed: 99,
    };
    const shortInventory = buildMissionWeightedInventory(
      "allied",
      shortScenario,
      4,
      true,
      0,
    );
    const enduranceInventory = buildMissionWeightedInventory(
      "allied",
      enduranceScenario,
      4,
      true,
      0,
    );
    expect(enduranceInventory.drone).toBeGreaterThanOrEqual(shortInventory.drone);
  });

  it("enforces missile floor for high-tempo missions", () => {
    const surgeScenario: ScenarioPreset = {
      ...scenario,
      aggressionOverride: "surge",
      seed: 2,
    };
    const inventory = buildMissionWeightedInventory(
      "enemy",
      surgeScenario,
      3,
      false,
      0,
    );
    expect(inventory.ballisticMissile).toBeGreaterThan(0);
  });
});
