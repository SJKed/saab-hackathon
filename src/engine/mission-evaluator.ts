import type { MetricsSnapshot } from "./metrics";
import type { AlliedCity } from "../models/entity";
import type { MissionOutcome, ScenarioPreset } from "../models/scenario";

export type MissionStatus = {
  outcome: MissionOutcome;
  reason: string;
  ticksElapsed: number;
  ticksRemaining: number;
  citiesRemaining: number;
  cityLosses: number;
  progressPercent: number;
};

export function createInitialMissionStatus(
  scenario: ScenarioPreset,
  initialCityCount: number,
): MissionStatus {
  const maxTicks = scenario.objective.maxTicks;
  return {
    outcome: "inProgress",
    reason: "Mission active.",
    ticksElapsed: 0,
    ticksRemaining: maxTicks === null ? Number.POSITIVE_INFINITY : maxTicks,
    citiesRemaining: initialCityCount,
    cityLosses: 0,
    progressPercent: 0,
  };
}

function getProgressPercent(ticksElapsed: number, durationTicks: number): number {
  const ratio = durationTicks <= 0 ? 1 : ticksElapsed / durationTicks;
  return Math.max(0, Math.min(100, ratio * 100));
}

export function evaluateMissionStatus(
  scenario: ScenarioPreset,
  tick: number,
  alliedCities: AlliedCity[],
  metrics: MetricsSnapshot,
): MissionStatus {
  const maxTicks = scenario.objective.maxTicks;
  const ticksElapsed = Math.max(0, tick);
  const ticksRemaining =
    maxTicks === null ? Number.POSITIVE_INFINITY : Math.max(0, maxTicks - ticksElapsed);
  const citiesRemaining = alliedCities.length;
  const cityLosses = Math.max(0, metrics.totalCityCount - citiesRemaining);
  const progressPercent = getProgressPercent(
    ticksElapsed,
    maxTicks ?? ticksElapsed + 1,
  );

  if (citiesRemaining < scenario.objective.minCitiesSurviving) {
    return {
      outcome: "lost",
      reason: "Mission failed: minimum surviving city threshold was not met.",
      ticksElapsed,
      ticksRemaining,
      citiesRemaining,
      cityLosses,
      progressPercent,
    };
  }

  if (cityLosses > scenario.objective.maxCityLosses) {
    return {
      outcome: "lost",
      reason: "Mission failed: maximum allowed city losses were exceeded.",
      ticksElapsed,
      ticksRemaining,
      citiesRemaining,
      cityLosses,
      progressPercent,
    };
  }

  if (maxTicks !== null && ticksElapsed >= maxTicks) {
    return {
      outcome: "won",
      reason: "Mission success: objectives held until the operation window closed.",
      ticksElapsed,
      ticksRemaining: 0,
      citiesRemaining,
      cityLosses,
      progressPercent: 100,
    };
  }

  return {
    outcome: "inProgress",
    reason: "Mission active.",
    ticksElapsed,
    ticksRemaining,
    citiesRemaining,
    cityLosses,
    progressPercent,
  };
}
