import type { PlatformClass } from "../models/entity";
import type { ScenarioPreset } from "../models/scenario";

export type PlatformInventory = Record<PlatformClass, number>;

type TeamKind = "allied" | "enemy";
type MissionTempo = "high-tempo" | "sustained-pressure" | "balanced-probe";
type MissionHorizon = "short" | "standard" | "endurance";

function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function weightedPick(
  random: () => number,
  weights: Array<{ classKey: PlatformClass; weight: number }>,
): PlatformClass {
  const total = weights.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) {
    return "drone";
  }
  let threshold = random() * total;
  for (const entry of weights) {
    threshold -= Math.max(0, entry.weight);
    if (threshold <= 0) {
      return entry.classKey;
    }
  }
  return weights[weights.length - 1].classKey;
}

export function buildMissionWeightedInventory(
  team: TeamKind,
  scenario: ScenarioPreset,
  targetCount: number,
  hasRadarObjectives: boolean,
  baseIndex: number,
): PlatformInventory {
  const objectiveTicks = scenario.objective.maxTicks ?? 420;
  const tempo = getMissionTempo(scenario);
  const horizon = getMissionHorizon(objectiveTicks);
  const intensity =
    tempo === "high-tempo" ? 1.35 : tempo === "sustained-pressure" ? 1.15 : 1;
  const enduranceBoost = horizon === "endurance" ? 1.18 : horizon === "short" ? 0.92 : 1;
  const budget = Math.max(
    5,
    Math.round((targetCount * 0.7 + objectiveTicks / 120) * intensity * enduranceBoost),
  );
  const random = createSeededRandom(scenario.seed + (team === "enemy" ? 1000 : 0) + baseIndex * 97);
  const inventory: PlatformInventory = {
    fighterJet: 0,
    drone: 0,
    ballisticMissile: 0,
  };
  const weights =
    team === "allied"
      ? [
          {
            classKey: "fighterJet" as const,
            weight: 2.1 + intensity * 0.2 + (horizon === "short" ? 0.2 : 0),
          },
          {
            classKey: "drone" as const,
            weight: 2.7 + (hasRadarObjectives ? 0.4 : 0) + (horizon === "endurance" ? 0.55 : 0),
          },
          {
            classKey: "ballisticMissile" as const,
            weight: 1.6 + intensity * 0.3 + (tempo === "high-tempo" ? 0.25 : 0),
          },
        ]
      : [
          {
            classKey: "fighterJet" as const,
            weight: 1.8 + intensity * 0.35 + (horizon === "short" ? 0.15 : 0),
          },
          {
            classKey: "drone" as const,
            weight: 2.4 + (horizon === "endurance" ? 0.5 : 0),
          },
          {
            classKey: "ballisticMissile" as const,
            weight:
              (hasRadarObjectives ? 2.2 : 1.4) +
              (tempo === "high-tempo" ? 0.35 : 0) +
              (horizon === "short" ? 0.15 : 0),
          },
        ];

  for (let idx = 0; idx < budget; idx += 1) {
    const selected = weightedPick(random, weights);
    inventory[selected] += 1;
  }

  if (inventory.fighterJet === 0) {
    inventory.fighterJet = 1;
  }
  if (inventory.drone === 0) {
    inventory.drone = 1;
  }
  if (tempo === "high-tempo" && inventory.ballisticMissile === 0) {
    inventory.ballisticMissile = 1;
    if (inventory.drone > 1) {
      inventory.drone -= 1;
    } else if (inventory.fighterJet > 1) {
      inventory.fighterJet -= 1;
    }
  }

  return inventory;
}

export function getLoadoutPolicyRationale(
  scenario: ScenarioPreset,
  hasRadarObjectives: boolean,
): string {
  const tempo = getMissionTempo(scenario);
  const objectiveTicks = scenario.objective.maxTicks ?? 420;
  const horizon = getMissionHorizon(objectiveTicks);
  const horizonLabel =
    horizon === "endurance"
      ? "endurance horizon"
      : horizon === "short"
        ? "short horizon"
        : "standard horizon";
  return hasRadarObjectives
    ? `Mission profile ${tempo} with ${horizonLabel} and radar-objective bias enabled.`
    : `Mission profile ${tempo} with ${horizonLabel} and baseline objective weighting.`;
}

function getMissionTempo(scenario: ScenarioPreset): MissionTempo {
  if (scenario.aggressionOverride === "surge") {
    return "high-tempo";
  }
  if (scenario.aggressionOverride === "pressure") {
    return "sustained-pressure";
  }
  return "balanced-probe";
}

function getMissionHorizon(objectiveTicks: number): MissionHorizon {
  if (objectiveTicks >= 420) {
    return "endurance";
  }
  if (objectiveTicks <= 220) {
    return "short";
  }
  return "standard";
}
