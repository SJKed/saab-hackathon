import type { RunSummary } from "./run-summary";

export type RunComparison = {
  previous: RunSummary;
  current: RunSummary;
  cityIntegrityDelta: number;
  neutralizedDelta: number;
  responseDelta: number | null;
};

export function compareRuns(
  previous: RunSummary,
  current: RunSummary,
): RunComparison {
  const previousResponse = previous.metrics.averageResponseTicks;
  const currentResponse = current.metrics.averageResponseTicks;

  return {
    previous,
    current,
    cityIntegrityDelta:
      current.metrics.cityIntegrityPercent - previous.metrics.cityIntegrityPercent,
    neutralizedDelta:
      current.metrics.enemyNeutralizedCount - previous.metrics.enemyNeutralizedCount,
    responseDelta:
      previousResponse === null || currentResponse === null
        ? null
        : currentResponse - previousResponse,
  };
}
