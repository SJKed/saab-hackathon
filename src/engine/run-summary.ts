import type { MetricsSnapshot } from "./metrics";
import type { MissionStatus } from "./mission-evaluator";
import type { ReplayStore } from "./replay-store";
import type { ScenarioPreset } from "../models/scenario";

export type RunSummary = {
  scenarioId: string;
  scenarioName: string;
  outcome: MissionStatus["outcome"];
  reason: string;
  ticksElapsed: number;
  generatedAt: number;
  metrics: MetricsSnapshot;
  highlights: string[];
};

export function buildRunSummary(
  scenario: ScenarioPreset,
  mission: MissionStatus,
  metrics: MetricsSnapshot,
  replay: ReplayStore,
): RunSummary {
  const highlights: string[] = [];
  if (replay.events.length > 0) {
    highlights.push(replay.events[0].message);
  }
  if (metrics.averageResponseTicks !== null) {
    highlights.push(
      `Average intercept response: ${metrics.averageResponseTicks.toFixed(1)} ticks.`,
    );
  }
  highlights.push(
    `City integrity ended at ${Math.round(metrics.cityIntegrityPercent)}%.`,
  );

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    outcome: mission.outcome,
    reason: mission.reason,
    ticksElapsed: mission.ticksElapsed,
    generatedAt: Date.now(),
    metrics,
    highlights: highlights.slice(0, 3),
  };
}
