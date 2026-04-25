import type { ResourceAssignment } from "./allocation";
import type { CombatLogEvent } from "./combat";
import type { AlliedCity, MobilePlatform } from "../models/entity";
import {
  getCategoryDefaultLossValueUsd,
  getLossBucketForCategory,
} from "../data/asset-valuation";
import { isPlatformDeployed } from "../models/platform-utils";

type SideLosses = {
  allied: number;
  enemy: number;
};

export type MetricsState = {
  initialCityCount: number;
  initialCityHealth: number;
  initialEnemyCount: number;
  initialResourceCount: number;
  assetValueById: Record<string, number>;
  enemyDeploymentTicks: Record<string, number>;
  firstInterceptResponseTicks: Record<string, number>;
  lossValueBySide: SideLosses;
  countedDestroyedEventIds: Record<string, true>;
};

export type MetricsSnapshot = {
  citiesProtectedPercent: number;
  protectedCityCount: number;
  totalCityCount: number;
  cityIntegrityPercent: number;
  enemyNeutralizedCount: number;
  totalEnemyCount: number;
  resourceLossCount: number;
  totalResourceCount: number;
  resourceEfficiencyLabel: string;
  lossValueBySide: SideLosses;
  averageResponseTicks: number | null;
  activeInterceptCount: number;
  activeReinforcementCount: number;
};

function sumHealth(units: { health: number }[]): number {
  return units.reduce((total, unit) => total + Math.max(0, unit.health), 0);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function getAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function createMetricsState(
  alliedCities: AlliedCity[],
  alliedSpawnZones: { id: string; assetValueUsd: number }[],
  enemyBases: { id: string; assetValueUsd: number }[],
  enemyPlatforms: MobilePlatform[],
  alliedPlatforms: MobilePlatform[],
  _tick: number,
): MetricsState {
  const assetValueById: Record<string, number> = {};
  for (const city of alliedCities) {
    assetValueById[city.id] = city.assetValueUsd;
  }
  for (const spawnZone of alliedSpawnZones) {
    assetValueById[spawnZone.id] = spawnZone.assetValueUsd;
  }
  for (const base of enemyBases) {
    assetValueById[base.id] = base.assetValueUsd;
  }
  for (const platform of enemyPlatforms) {
    assetValueById[platform.id] = platform.assetValueUsd;
  }
  for (const platform of alliedPlatforms) {
    assetValueById[platform.id] = platform.assetValueUsd;
  }

  return {
    initialCityCount: alliedCities.length,
    initialCityHealth: sumHealth(alliedCities),
    initialEnemyCount: enemyPlatforms.length,
    initialResourceCount: alliedPlatforms.length,
    assetValueById,
    enemyDeploymentTicks: {},
    firstInterceptResponseTicks: {},
    lossValueBySide: { allied: 0, enemy: 0 },
    countedDestroyedEventIds: {},
  };
}

export function updateMetricsState(
  state: MetricsState,
  enemyPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  combatEvents: CombatLogEvent[],
  tick: number,
): MetricsState {
  const assetValueById = { ...state.assetValueById };
  for (const platform of enemyPlatforms) {
    assetValueById[platform.id] = platform.assetValueUsd;
  }
  const enemyDeploymentTicks = { ...state.enemyDeploymentTicks };
  const firstInterceptResponseTicks = { ...state.firstInterceptResponseTicks };
  const countedDestroyedEventIds = { ...state.countedDestroyedEventIds };
  const lossValueBySide = { ...state.lossValueBySide };

  for (const enemyPlatform of enemyPlatforms) {
    if (!isPlatformDeployed(enemyPlatform)) {
      continue;
    }

    if (enemyDeploymentTicks[enemyPlatform.id] === undefined) {
      enemyDeploymentTicks[enemyPlatform.id] = tick;
    }
  }

  for (const assignment of assignments) {
    if (assignment.mission !== "intercept") {
      continue;
    }

    if (firstInterceptResponseTicks[assignment.targetId] !== undefined) {
      continue;
    }

    const deploymentTick = enemyDeploymentTicks[assignment.targetId];
    if (deploymentTick === undefined) {
      continue;
    }

    firstInterceptResponseTicks[assignment.targetId] = Math.max(0, tick - deploymentTick);
  }

  // We consume only tick-local combat events, but still guard against replays/desyncs.
  for (const event of combatEvents) {
    if (
      event.kind !== "destroyed" ||
      !event.destroyedUnit ||
      countedDestroyedEventIds[event.id]
    ) {
      continue;
    }

    const category = event.destroyedUnit.category;
    const bucket = getLossBucketForCategory(category);
    const value =
      assetValueById[event.destroyedUnit.id] ??
      getCategoryDefaultLossValueUsd(category);
    lossValueBySide[bucket] += Math.max(0, value);
    countedDestroyedEventIds[event.id] = true;
  }

  return {
    ...state,
    assetValueById,
    enemyDeploymentTicks,
    firstInterceptResponseTicks,
    lossValueBySide,
    countedDestroyedEventIds,
  };
}

export function getMetricsSnapshot(
  state: MetricsState,
  alliedCities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
  alliedPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
): MetricsSnapshot {
  const enemyNeutralizedCount = Math.max(
    0,
    state.initialEnemyCount - enemyPlatforms.length,
  );
  const resourceLossCount = Math.max(
    0,
    state.initialResourceCount - alliedPlatforms.length,
  );
  const activeInterceptCount = assignments.filter(
    (assignment) => assignment.mission === "intercept",
  ).length;
  const activeReinforcementCount = assignments.length - activeInterceptCount;
  const averageResponseTicks = getAverage(
    Object.values(state.firstInterceptResponseTicks),
  );

  return {
    citiesProtectedPercent: clampPercent(
      (alliedCities.length / Math.max(1, state.initialCityCount)) * 100,
    ),
    protectedCityCount: alliedCities.length,
    totalCityCount: state.initialCityCount,
    cityIntegrityPercent: clampPercent(
      (sumHealth(alliedCities) / Math.max(1, state.initialCityHealth)) * 100,
    ),
    enemyNeutralizedCount,
    totalEnemyCount: state.initialEnemyCount,
    resourceLossCount,
    totalResourceCount: state.initialResourceCount,
    resourceEfficiencyLabel: `${enemyNeutralizedCount} / ${resourceLossCount}`,
    lossValueBySide: state.lossValueBySide,
    averageResponseTicks,
    activeInterceptCount,
    activeReinforcementCount,
  };
}
