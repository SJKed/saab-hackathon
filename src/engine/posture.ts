import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
} from "../models/entity";
import { distanceKm } from "../models/distance";
import {
  hasReachedLatestSafeRecallMoment,
} from "../models/platform-recovery";
import {
  hasUsablePayload,
  isPlatformDeployed,
  isPlatformDestroyed,
  isPlatformStored,
} from "../models/platform-utils";

export type TeamPostureStance = "standby" | "balanced" | "surging";

export type TeamPostureMemory = {
  sustainedSurplusSeconds: number;
  sustainedDemandSeconds: number;
};

export type AlliedCityPosture = {
  cityId: string;
  cityName: string;
  demandScore: number;
  unmetCoverage: number;
  deployedCoverage: number;
  reserveCoverage: number;
  inboundPressure: number;
  activeThreatCount: number;
};

export type EnemyCityPosture = {
  cityId: string;
  cityName: string;
  demandScore: number;
  unmetPressure: number;
  alliedCoverage: number;
  enemyPressure: number;
};

type BaseTeamPostureSnapshot<TCityState> = {
  stance: TeamPostureStance;
  summary: string;
  demandScore: number;
  activeBurdenScore: number;
  usefulAirborneScore: number;
  reserveScore: number;
  surplusScore: number;
  sustainedSurplusSeconds: number;
  sustainedDemandSeconds: number;
  recallPressureActive: boolean;
  launchReleaseActive: boolean;
  recommendedActiveCount: number;
  cityStates: TCityState[];
};

export type AlliedForcePostureSnapshot =
  BaseTeamPostureSnapshot<AlliedCityPosture> & {
    incursionCount: number;
  };

export type EnemyForcePostureSnapshot =
  BaseTeamPostureSnapshot<EnemyCityPosture> & {
    opportunityCount: number;
  };

const recallPersistenceSeconds = 5.5;
const launchReleasePersistenceSeconds = 3.25;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPlatformClassWeight(platform: MobilePlatform): number {
  switch (platform.platformClass) {
    case "fighterJet":
      return 1.2;
    case "ballisticMissile":
      return 1.45;
    case "drone":
      return 0.85;
    default:
      return 1;
  }
}

function getPayloadReadiness(platform: MobilePlatform): number {
  if (platform.weapons.length === 0) {
    return 0.45;
  }

  const totalAmmo = platform.weapons.reduce(
    (sum, weapon) => sum + weapon.ammunition,
    0,
  );
  const maxAmmo = platform.weapons.reduce(
    (sum, weapon) => sum + weapon.maxAmmunition,
    0,
  );

  if (maxAmmo <= 0) {
    return 0.45;
  }

  return clamp(totalAmmo / maxAmmo, 0.25, 1);
}

function getPlatformBurdenScore(platform: MobilePlatform): number {
  const enduranceRatio =
    platform.maxEnduranceSeconds <= 0
      ? 1
      : clamp(platform.enduranceSeconds / platform.maxEnduranceSeconds, 0.2, 1);
  const durabilityRatio =
    platform.combat.maxDurability <= 0
      ? 1
      : clamp(platform.combat.durability / platform.combat.maxDurability, 0.35, 1);

  return (
    getPlatformClassWeight(platform) *
    enduranceRatio *
    durabilityRatio *
    getPayloadReadiness(platform)
  );
}

function getCoverageContribution(
  platform: MobilePlatform,
  city: AlliedCity,
  distanceScale: number,
  weightMultiplier: number,
): number {
  const distanceFactor =
    1 / (1 + distanceKm(platform.position, city.position) / distanceScale);
  const platformStrength =
    getPlatformClassWeight(platform) *
    (0.52 +
      platform.sensors.sensorRange / 260 +
      platform.combat.maxDurability / 220);

  return platformStrength * distanceFactor * weightMultiplier;
}

function getEnemyPressureContribution(
  enemyPlatform: MobilePlatform,
  city: AlliedCity,
): number {
  const proximityFactor =
    1 / (1 + distanceKm(enemyPlatform.position, city.position) / 255);
  const targetBias = enemyPlatform.targetId === city.id ? 1.25 : 0.55;
  const pressureWeight =
    enemyPlatform.threatLevel *
    getPlatformClassWeight(enemyPlatform) *
    Math.max(proximityFactor, enemyPlatform.targetId === city.id ? 0.85 : 0);

  return pressureWeight * targetBias;
}

function getDeployedPlatformRelevance<TCityState extends { cityId: string; demandScore: number }>(
  cityStates: TCityState[],
  cities: AlliedCity[],
  contributionForCity: (city: AlliedCity) => number,
): number {
  let bestRelevance = 0;

  for (const cityState of cityStates) {
    const city = cities.find((candidate) => candidate.id === cityState.cityId);
    if (!city) {
      continue;
    }

    const contribution = contributionForCity(city);
    const demandFactor = clamp(cityState.demandScore / 4.4, 0.25, 1.35);
    bestRelevance = Math.max(bestRelevance, contribution * demandFactor);
  }

  return bestRelevance;
}

function getIncursionCount(
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): number {
  let incursionCount = 0;

  for (const enemyPlatform of enemyPlatforms) {
    if (!isPlatformDeployed(enemyPlatform) || isPlatformDestroyed(enemyPlatform)) {
      continue;
    }

    const nearestCityDistance = cities.reduce((bestDistance, city) => {
      const distance = distanceKm(enemyPlatform.position, city.position);
      return Math.min(bestDistance, distance);
    }, Number.POSITIVE_INFINITY);

    if (enemyPlatform.targetId || nearestCityDistance <= 260) {
      incursionCount += 1;
    }
  }

  return incursionCount;
}

export function getAlliedCoverageScoreForCity(
  platform: MobilePlatform,
  city: AlliedCity,
): number {
  return getCoverageContribution(
    platform,
    city,
    isPlatformDeployed(platform) ? 235 : 320,
    isPlatformDeployed(platform) ? 0.95 : 0.42,
  );
}

export function createTeamPostureMemory(): TeamPostureMemory {
  return {
    sustainedSurplusSeconds: 0,
    sustainedDemandSeconds: 0,
  };
}

export function applyPostureMemory<TSnapshot extends BaseTeamPostureSnapshot<unknown>>(
  snapshot: TSnapshot,
  memory: TeamPostureMemory,
  deltaSeconds: number,
  options?: {
    surplusThreshold?: number;
    demandGapThreshold?: number;
  },
): {
  snapshot: TSnapshot;
  memory: TeamPostureMemory;
} {
  const surplusThreshold = options?.surplusThreshold ?? 2;
  const demandGapThreshold = options?.demandGapThreshold ?? 1.1;
  const sustainedDelta = Math.max(0, deltaSeconds);
  const surplusActive =
    snapshot.stance === "standby" && snapshot.surplusScore >= surplusThreshold;
  const demandActive =
    snapshot.stance === "surging" ||
    snapshot.demandScore - snapshot.activeBurdenScore >= demandGapThreshold;
  const nextMemory: TeamPostureMemory = {
    sustainedSurplusSeconds: surplusActive
      ? memory.sustainedSurplusSeconds + sustainedDelta
      : Math.max(0, memory.sustainedSurplusSeconds - sustainedDelta * 1.5),
    sustainedDemandSeconds: demandActive
      ? memory.sustainedDemandSeconds + sustainedDelta
      : Math.max(0, memory.sustainedDemandSeconds - sustainedDelta * 1.5),
  };

  return {
    snapshot: {
      ...snapshot,
      sustainedSurplusSeconds: nextMemory.sustainedSurplusSeconds,
      sustainedDemandSeconds: nextMemory.sustainedDemandSeconds,
      recallPressureActive:
        nextMemory.sustainedSurplusSeconds >= recallPersistenceSeconds,
      launchReleaseActive:
        nextMemory.sustainedDemandSeconds >= launchReleasePersistenceSeconds,
    } as TSnapshot,
    memory: nextMemory,
  };
}

export function evaluateAlliedForcePosture(
  cities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
): AlliedForcePostureSnapshot {
  const cityStates = cities
    .map((city) => {
      let deployedCoverage = 0;
      let reserveCoverage = 0;
      let inboundPressure = 0;
      let activeThreatCount = 0;

      for (const alliedPlatform of alliedPlatforms) {
        if (isPlatformDestroyed(alliedPlatform) || !hasUsablePayload(alliedPlatform)) {
          continue;
        }
        if (
          isPlatformDeployed(alliedPlatform) &&
          hasReachedLatestSafeRecallMoment(alliedPlatform, alliedSpawnZones, [])
        ) {
          continue;
        }

        if (isPlatformDeployed(alliedPlatform)) {
          deployedCoverage += getCoverageContribution(
            alliedPlatform,
            city,
            235,
            0.95,
          );
          continue;
        }

        if (isPlatformStored(alliedPlatform)) {
          reserveCoverage += getCoverageContribution(
            alliedPlatform,
            city,
            320,
            0.42,
          );
        }
      }

      for (const enemyPlatform of enemyPlatforms) {
        if (!isPlatformDeployed(enemyPlatform)) {
          continue;
        }

        inboundPressure += getEnemyPressureContribution(enemyPlatform, city);
        if (enemyPlatform.targetId === city.id) {
          activeThreatCount += 1;
        }
      }

      const demandScore =
        city.value * 0.42 +
        inboundPressure * 1.85 +
        activeThreatCount * 0.55;

      return {
        cityId: city.id,
        cityName: city.name ?? city.id,
        demandScore,
        unmetCoverage: Math.max(0, demandScore - deployedCoverage),
        deployedCoverage,
        reserveCoverage,
        inboundPressure,
        activeThreatCount,
      };
    })
    .sort((a, b) => b.unmetCoverage - a.unmetCoverage || b.demandScore - a.demandScore);

  let activeBurdenScore = 0;
  let usefulAirborneScore = 0;
  let reserveScore = 0;

  for (const alliedPlatform of alliedPlatforms) {
    if (isPlatformDestroyed(alliedPlatform) || !hasUsablePayload(alliedPlatform)) {
      continue;
    }
    if (
      isPlatformDeployed(alliedPlatform) &&
      hasReachedLatestSafeRecallMoment(alliedPlatform, alliedSpawnZones, [])
    ) {
      continue;
    }

    const burden = getPlatformBurdenScore(alliedPlatform);
    if (isPlatformDeployed(alliedPlatform)) {
      activeBurdenScore += burden;
      const relevance = getDeployedPlatformRelevance(
        cityStates,
        cities,
        (city) => getCoverageContribution(alliedPlatform, city, 240, 1),
      );
      usefulAirborneScore += burden * clamp(0.25 + relevance * 0.34, 0.25, 1.35);
      continue;
    }

    if (isPlatformStored(alliedPlatform)) {
      reserveScore += burden * 0.72;
    }
  }

  const demandScore = cityStates.reduce((total, cityState) => total + cityState.demandScore, 0);
  const incursionCount = getIncursionCount(cities, enemyPlatforms);
  const surplusScore = activeBurdenScore - demandScore;
  const recommendedActiveCount = Math.max(1, Math.ceil(demandScore / 2.35));
  const stance: TeamPostureStance =
    demandScore > activeBurdenScore + 1.6 || incursionCount >= 4
      ? "surging"
      : surplusScore > 2.2 && incursionCount <= 1
        ? "standby"
        : "balanced";
  const summary =
    stance === "surging"
      ? "Defensive surge justified by active incursions and uncovered demand."
      : stance === "standby"
        ? "Air picture saturated; redundant patrols should recover to reserve."
        : "Coverage and reserve posture are broadly balanced.";

  return {
    stance,
    summary,
    demandScore,
    activeBurdenScore,
    usefulAirborneScore,
    reserveScore,
    surplusScore,
    sustainedSurplusSeconds: 0,
    sustainedDemandSeconds: 0,
    recallPressureActive: false,
    launchReleaseActive: false,
    recommendedActiveCount,
    incursionCount,
    cityStates,
  };
}

export function evaluateEnemyForcePosture(
  cities: AlliedCity[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
  enemyBases: EnemyBase[],
  aggressionMultiplier: number,
): EnemyForcePostureSnapshot {
  const cityStates = cities
    .map((city) => {
      let alliedCoverage = 0;
      let enemyPressure = 0;

      for (const alliedPlatform of alliedPlatforms) {
        if (
          isPlatformDestroyed(alliedPlatform) ||
          !isPlatformDeployed(alliedPlatform) ||
          !hasUsablePayload(alliedPlatform)
        ) {
          continue;
        }

        alliedCoverage += getCoverageContribution(
          alliedPlatform,
          city,
          245,
          0.92,
        );
      }

      for (const enemyPlatform of enemyPlatforms) {
        if (
          isPlatformDestroyed(enemyPlatform) ||
          !isPlatformDeployed(enemyPlatform) ||
          !hasUsablePayload(enemyPlatform) ||
          hasReachedLatestSafeRecallMoment(enemyPlatform, [], enemyBases)
        ) {
          continue;
        }

        enemyPressure += getEnemyPressureContribution(enemyPlatform, city);
      }

      const demandScore =
        (city.value * 0.44 + Math.max(0, 2.9 - alliedCoverage) * 1.35) *
        (0.7 + aggressionMultiplier * 0.8);

      return {
        cityId: city.id,
        cityName: city.name ?? city.id,
        demandScore,
        unmetPressure: Math.max(0, demandScore - enemyPressure),
        alliedCoverage,
        enemyPressure,
      };
    })
    .sort((a, b) => b.unmetPressure - a.unmetPressure || b.demandScore - a.demandScore);

  let activeBurdenScore = 0;
  let usefulAirborneScore = 0;
  let reserveScore = 0;

  for (const enemyPlatform of enemyPlatforms) {
    if (
      isPlatformDestroyed(enemyPlatform) ||
      !hasUsablePayload(enemyPlatform) ||
      (isPlatformDeployed(enemyPlatform) &&
        hasReachedLatestSafeRecallMoment(enemyPlatform, [], enemyBases))
    ) {
      continue;
    }

    const burden = getPlatformBurdenScore(enemyPlatform);
    if (isPlatformDeployed(enemyPlatform)) {
      activeBurdenScore += burden;
      const relevance = getDeployedPlatformRelevance(
        cityStates,
        cities,
        (city) => getEnemyPressureContribution(enemyPlatform, city),
      );
      usefulAirborneScore += burden * clamp(0.25 + relevance * 0.28, 0.25, 1.3);
      continue;
    }

    if (isPlatformStored(enemyPlatform)) {
      reserveScore += burden * 0.72;
    }
  }

  const demandScore = cityStates.reduce(
    (total, cityState) => total + cityState.demandScore,
    0,
  );
  const opportunityCount = cityStates.filter(
    (cityState) => cityState.unmetPressure >= 0.8,
  ).length;
  const surplusScore = activeBurdenScore - demandScore;
  const recommendedActiveCount = Math.max(1, Math.ceil(demandScore / 2.15));
  const stance: TeamPostureStance =
    demandScore > activeBurdenScore + 1.4
      ? "surging"
      : surplusScore > 2.1 && opportunityCount <= 1
        ? "standby"
        : "balanced";
  const summary =
    stance === "surging"
      ? "Exposure spike justifies additional launch waves."
      : stance === "standby"
        ? "Current offensive screen is already saturating available targets."
        : "Launch appetite and active pressure are broadly matched.";

  return {
    stance,
    summary,
    demandScore,
    activeBurdenScore,
    usefulAirborneScore,
    reserveScore,
    surplusScore,
    sustainedSurplusSeconds: 0,
    sustainedDemandSeconds: 0,
    recallPressureActive: false,
    launchReleaseActive: false,
    recommendedActiveCount,
    opportunityCount,
    cityStates,
  };
}
