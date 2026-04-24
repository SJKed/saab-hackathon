import type { ResourceAssignment } from "./allocation";
import type { AlliedCity, Enemy, Resource } from "../models/entity";

export type MetricsState = {
  initialCityCount: number;
  initialCityHealth: number;
  initialEnemyCount: number;
  initialResourceCount: number;
  initialResourceOrdnance: number;
  ordnanceLaunched: number;
  ordnanceIntercepted: number;
  ordnanceImpacted: number;
  ordnanceExpired: number;
  enemyReloadDecisionCount: number;
  enemyCoverDecisionCount: number;
  enemyReloadCompleteCount: number;
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
  activeReloadCount: number;
  depletedResourceCount: number;
  resourceOrdnanceRemaining: number;
  resourceOrdnanceExpended: number;
  ordnanceLaunched: number;
  ordnanceIntercepted: number;
  ordnanceImpacted: number;
  ordnanceExpired: number;
  enemyReloadDecisionCount: number;
  enemyCoverDecisionCount: number;
  enemyReloadCompleteCount: number;
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
  enemies: Enemy[],
  resources: Resource[],
  tick: number,
): MetricsState {
  return {
    initialCityCount: alliedCities.length,
    initialCityHealth: sumHealth(alliedCities),
    initialEnemyCount: enemies.length,
    initialResourceCount: resources.length,
    initialResourceOrdnance: resources.reduce((total, resource) => total + resource.ordnance, 0),
    ordnanceLaunched: 0,
    ordnanceIntercepted: 0,
    ordnanceImpacted: 0,
    ordnanceExpired: 0,
    enemyReloadDecisionCount: 0,
    enemyCoverDecisionCount: 0,
    enemyReloadCompleteCount: 0,
    enemyDeploymentTicks: Object.fromEntries(enemies.map((enemy) => [enemy.id, tick])),
    firstInterceptResponseTicks: {},
  };
}

export function updateMetricsState(
  state: MetricsState,
  enemies: Enemy[],
  assignments: ResourceAssignment[],
  tick: number,
  ordnanceStats?: {
    launched: number;
    intercepted: number;
    impacted: number;
    expired: number;
  },
): MetricsState {
  const enemyDeploymentTicks = { ...state.enemyDeploymentTicks };
  const firstInterceptResponseTicks = { ...state.firstInterceptResponseTicks };

  for (const enemy of enemies) {
    if (enemyDeploymentTicks[enemy.id] === undefined) {
      enemyDeploymentTicks[enemy.id] = tick;
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
    ordnanceLaunched: state.ordnanceLaunched + (ordnanceStats?.launched ?? 0),
    ordnanceIntercepted: state.ordnanceIntercepted + (ordnanceStats?.intercepted ?? 0),
    ordnanceImpacted: state.ordnanceImpacted + (ordnanceStats?.impacted ?? 0),
    ordnanceExpired: state.ordnanceExpired + (ordnanceStats?.expired ?? 0),
    enemyReloadDecisionCount:
      state.enemyReloadDecisionCount +
      enemies.filter((enemy) => enemy.behaviorState === "reload").length,
    enemyCoverDecisionCount:
      state.enemyCoverDecisionCount +
      enemies.filter((enemy) => enemy.behaviorState === "cover").length,
    enemyReloadCompleteCount:
      state.enemyReloadCompleteCount +
      enemies.filter((enemy) => enemy.behaviorState === "reload-complete").length,
    enemyDeploymentTicks,
    firstInterceptResponseTicks,
  };
}

export function getMetricsSnapshot(
  state: MetricsState,
  alliedCities: AlliedCity[],
  enemies: Enemy[],
  resources: Resource[],
  assignments: ResourceAssignment[],
): MetricsSnapshot {
  const enemyNeutralizedCount = Math.max(0, state.initialEnemyCount - enemies.length);
  const resourceLossCount = Math.max(0, state.initialResourceCount - resources.length);
  const activeInterceptCount = assignments.filter(
    (assignment) => assignment.mission === "intercept",
  ).length;
  const activeReinforcementCount = assignments.filter(
    (assignment) => assignment.mission === "reinforce",
  ).length;
  const activeReloadCount = assignments.filter(
    (assignment) => assignment.mission === "reload",
  ).length;
  const averageResponseTicks = getAverage(
    Object.values(state.firstInterceptResponseTicks),
  );
  const resourceOrdnanceRemaining = resources.reduce(
    (total, resource) => total + Math.max(0, resource.ordnance),
    0,
  );
  const depletedResourceCount = resources.filter((resource) => resource.ordnance <= 0).length;

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
    activeReloadCount,
    depletedResourceCount,
    resourceOrdnanceRemaining,
    resourceOrdnanceExpended: Math.max(
      0,
      state.initialResourceOrdnance - resourceOrdnanceRemaining,
    ),
    ordnanceLaunched: state.ordnanceLaunched,
    ordnanceIntercepted: state.ordnanceIntercepted,
    ordnanceImpacted: state.ordnanceImpacted,
    ordnanceExpired: state.ordnanceExpired,
    enemyReloadDecisionCount: state.enemyReloadDecisionCount,
    enemyCoverDecisionCount: state.enemyCoverDecisionCount,
    enemyReloadCompleteCount: state.enemyReloadCompleteCount,
  };
}
