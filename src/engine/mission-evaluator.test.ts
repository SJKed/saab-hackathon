import { describe, expect, it } from "vitest";
import { evaluateMissionStatus } from "./mission-evaluator";
import type { ScenarioPreset } from "../models/scenario";
import type { AlliedCity } from "../models/entity";
import type { MetricsSnapshot } from "./metrics";

const scenario: ScenarioPreset = {
  id: "test",
  name: "Test",
  description: "Test scenario",
  briefing: "Briefing",
  aggressionOverride: "opening",
  seed: 1,
  objective: {
    minCitiesSurviving: 2,
    maxTicks: 10,
    maxCityLosses: 1,
  },
};

const metrics: MetricsSnapshot = {
  citiesProtectedPercent: 100,
  protectedCityCount: 3,
  totalCityCount: 3,
  cityIntegrityPercent: 100,
  enemyNeutralizedCount: 0,
  totalEnemyCount: 5,
  resourceLossCount: 0,
  totalResourceCount: 5,
  resourceEfficiencyLabel: "0 / 0",
  averageResponseTicks: null,
  activeInterceptCount: 0,
  activeReinforcementCount: 0,
  citySamRemainingPercent: 100,
  citySamRemainingCount: 120,
  enemyBaseSamRemainingPercent: 100,
  enemyBaseSamRemainingCount: 80,
  alliedSpendTotal: 0,
  enemySpendTotal: 0,
  alliedSpendMunitions: 0,
  alliedSpendAttrition: 0,
  alliedSpendInfrastructure: 0,
  enemySpendMunitions: 0,
  enemySpendAttrition: 0,
  enemySpendInfrastructure: 0,
  spendDelta: 0,
  exchangeRatio: 0,
  alliedSpendRatePerTick: 0,
  enemySpendRatePerTick: 0,
};

function createCities(count: number): AlliedCity[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `c-${idx}`,
    name: `City ${idx}`,
    value: 10,
    threat: 0,
    maxHealth: 200,
    health: 200,
    defenseRating: 0.2,
    position: { x: idx * 10, y: idx * 10 },
  }));
}

describe("evaluateMissionStatus", () => {
  it("reports in-progress state before objectives conclude", () => {
    const status = evaluateMissionStatus(scenario, 5, createCities(3), metrics);
    expect(status.outcome).toBe("inProgress");
    expect(status.ticksRemaining).toBe(5);
  });

  it("reports loss when surviving cities drop below threshold", () => {
    const status = evaluateMissionStatus(scenario, 3, createCities(1), metrics);
    expect(status.outcome).toBe("lost");
  });

  it("reports win when duration is reached with valid city count", () => {
    const status = evaluateMissionStatus(scenario, 10, createCities(2), metrics);
    expect(status.outcome).toBe("won");
    expect(status.progressPercent).toBe(100);
  });

  it("supports infinite scenarios without time-based auto-win", () => {
    const infiniteScenario: ScenarioPreset = {
      ...scenario,
      objective: { ...scenario.objective, maxTicks: null },
    };
    const status = evaluateMissionStatus(infiniteScenario, 200, createCities(3), metrics);
    expect(status.outcome).toBe("inProgress");
    expect(status.ticksRemaining).toBe(Number.POSITIVE_INFINITY);
  });
});
