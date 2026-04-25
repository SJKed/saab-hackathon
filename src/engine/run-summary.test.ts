import { describe, expect, it } from "vitest";
import { compareRuns } from "./run-comparison";
import { buildRunSummary } from "./run-summary";
import type { MetricsSnapshot } from "./metrics";
import type { MissionStatus } from "./mission-evaluator";
import type { ScenarioPreset } from "../models/scenario";

const scenario: ScenarioPreset = {
  id: "baseline-shield",
  name: "Baseline Shield",
  description: "",
  briefing: "",
  aggressionOverride: "opening",
  objective: {
    minCitiesSurviving: 2,
    maxTicks: 100,
    maxCityLosses: 1,
  },
  seed: 42,
};

const metrics: MetricsSnapshot = {
  citiesProtectedPercent: 66,
  protectedCityCount: 2,
  totalCityCount: 3,
  cityIntegrityPercent: 73,
  enemyNeutralizedCount: 7,
  totalEnemyCount: 12,
  resourceLossCount: 2,
  totalResourceCount: 6,
  resourceEfficiencyLabel: "7 / 2",
  averageResponseTicks: 4.2,
  activeInterceptCount: 1,
  activeReinforcementCount: 1,
};

const mission: MissionStatus = {
  outcome: "won",
  reason: "Mission success",
  ticksElapsed: 100,
  ticksRemaining: 0,
  citiesRemaining: 2,
  cityLosses: 1,
  progressPercent: 100,
};

describe("run summary and comparison", () => {
  it("builds a summary with highlights", () => {
    const summary = buildRunSummary(scenario, mission, metrics, {
      frames: [],
      events: [{ tick: 30, message: "Enemy wave intercepted." }],
    });
    expect(summary.outcome).toBe("won");
    expect(summary.highlights.length).toBeGreaterThan(0);
  });

  it("computes deltas between runs", () => {
    const previous = buildRunSummary(scenario, mission, metrics, {
      frames: [],
      events: [],
    });
    const current = buildRunSummary(
      scenario,
      mission,
      { ...metrics, cityIntegrityPercent: 80, enemyNeutralizedCount: 9 },
      { frames: [], events: [] },
    );
    const comparison = compareRuns(previous, current);
    expect(comparison.cityIntegrityDelta).toBeGreaterThan(0);
    expect(comparison.neutralizedDelta).toBe(2);
  });
});
