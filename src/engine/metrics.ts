import type { ResourceAssignment } from "./allocation";
import type { AlliedCity, MobilePlatform } from "../models/entity";
import { isPlatformDeployed } from "../models/platform-utils";

export type MetricsState = {
  initialCityCount: number;
  initialCityHealth: number;
  initialEnemyCount: number;
  initialResourceCount: number;
  enemyDeploymentTicks: Record<string, number>;
  firstInterceptResponseTicks: Record<string, number>;
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
  enemyPlatforms: MobilePlatform[],
  alliedPlatforms: MobilePlatform[],
  _tick: number,
): MetricsState {
  return {
    initialCityCount: alliedCities.length,
    initialCityHealth: sumHealth(alliedCities),
    initialEnemyCount: enemyPlatforms.length,
    initialResourceCount: alliedPlatforms.length,
    enemyDeploymentTicks: {},
    firstInterceptResponseTicks: {},
  };
}

export function updateMetricsState(
  state: MetricsState,
  enemyPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  tick: number,
): MetricsState {
  const enemyDeploymentTicks = { ...state.enemyDeploymentTicks };
  const firstInterceptResponseTicks = { ...state.firstInterceptResponseTicks };

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

  return {
    ...state,
    enemyDeploymentTicks,
    firstInterceptResponseTicks,
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
  const activeReinforcementCount = assignments.filter(
    (assignment) => assignment.mission === "reinforce",
  ).length;
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
    averageResponseTicks,
    activeInterceptCount,
    activeReinforcementCount,
  };
}
