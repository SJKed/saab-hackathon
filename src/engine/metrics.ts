import type { ResourceAssignment } from "./allocation";
import type { CombatLogEvent } from "./combat";
import {
  accumulateEconomyFromCombatEvents,
  buildPlatformEconomyCatalog,
  createEconomyLedger,
  getExchangeRatio,
  getSpendDelta,
  mergeEconomyLedger,
  type EconomyLedger,
  type PlatformEconomyProfile,
} from "./economy";
import type { AlliedCity, EnemyBase, MobilePlatform } from "../models/entity";
import { isPlatformDeployed } from "../models/platform-utils";

export type MetricsState = {
  initialCityCount: number;
  initialCityHealth: number;
  initialEnemyCount: number;
  initialResourceCount: number;
  initialCitySamCount: number;
  initialEnemyBaseSamCount: number;
  platformEconomyCatalog: Record<string, PlatformEconomyProfile>;
  countedDestroyedPlatformIds: Set<string>;
  economyLedger: EconomyLedger;
  lastTickEconomyDelta: EconomyLedger;
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
  citySamRemainingPercent: number;
  citySamRemainingCount: number;
  enemyBaseSamRemainingPercent: number;
  enemyBaseSamRemainingCount: number;
  alliedSpendTotal: number;
  enemySpendTotal: number;
  alliedSpendMunitions: number;
  alliedSpendAttrition: number;
  alliedSpendInfrastructure: number;
  enemySpendMunitions: number;
  enemySpendAttrition: number;
  enemySpendInfrastructure: number;
  spendDelta: number;
  exchangeRatio: number;
  alliedSpendRatePerTick: number;
  enemySpendRatePerTick: number;
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

function sumMissiles(
  units: Array<{ missileAmmunition?: number }>,
): number {
  return units.reduce(
    (total, unit) => total + Math.max(0, unit.missileAmmunition ?? 0),
    0,
  );
}

export function createMetricsState(
  alliedCities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
  alliedPlatforms: MobilePlatform[],
  enemyBases: EnemyBase[],
  _tick: number,
): MetricsState {
  return {
    initialCityCount: alliedCities.length,
    initialCityHealth: sumHealth(alliedCities),
    initialEnemyCount: enemyPlatforms.length,
    initialResourceCount: alliedPlatforms.length,
    initialCitySamCount: sumMissiles(alliedCities),
    initialEnemyBaseSamCount: sumMissiles(enemyBases),
    platformEconomyCatalog: buildPlatformEconomyCatalog([
      ...alliedPlatforms,
      ...enemyPlatforms,
    ]),
    countedDestroyedPlatformIds: new Set<string>(),
    economyLedger: createEconomyLedger(),
    lastTickEconomyDelta: createEconomyLedger(),
    enemyDeploymentTicks: {},
    firstInterceptResponseTicks: {},
  };
}

export function updateMetricsState(
  state: MetricsState,
  enemyPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  combatEvents: CombatLogEvent[],
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
  const countedDestroyedPlatformIds = new Set(state.countedDestroyedPlatformIds);
  const economyDelta = accumulateEconomyFromCombatEvents({
    events: combatEvents,
    platformCatalog: state.platformEconomyCatalog,
    alreadyCountedDestroyedIds: countedDestroyedPlatformIds,
  });

  return {
    ...state,
    countedDestroyedPlatformIds,
    economyLedger: mergeEconomyLedger(state.economyLedger, economyDelta.ledgerDelta),
    lastTickEconomyDelta: economyDelta.ledgerDelta,
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
  enemyBases: EnemyBase[],
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
  const citySamRemainingCount = sumMissiles(alliedCities);
  const enemyBaseSamRemainingCount = sumMissiles(enemyBases);

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
    citySamRemainingPercent: clampPercent(
      (citySamRemainingCount / Math.max(1, state.initialCitySamCount)) * 100,
    ),
    citySamRemainingCount,
    enemyBaseSamRemainingPercent: clampPercent(
      (enemyBaseSamRemainingCount / Math.max(1, state.initialEnemyBaseSamCount)) * 100,
    ),
    enemyBaseSamRemainingCount,
    alliedSpendTotal: state.economyLedger.allied.total,
    enemySpendTotal: state.economyLedger.enemy.total,
    alliedSpendMunitions: state.economyLedger.allied.munitions,
    alliedSpendAttrition: state.economyLedger.allied.attrition,
    alliedSpendInfrastructure: state.economyLedger.allied.infrastructure,
    enemySpendMunitions: state.economyLedger.enemy.munitions,
    enemySpendAttrition: state.economyLedger.enemy.attrition,
    enemySpendInfrastructure: state.economyLedger.enemy.infrastructure,
    spendDelta: getSpendDelta(state.economyLedger),
    exchangeRatio: getExchangeRatio(state.economyLedger),
    alliedSpendRatePerTick: state.lastTickEconomyDelta.allied.total,
    enemySpendRatePerTick: state.lastTickEconomyDelta.enemy.total,
  };
}
