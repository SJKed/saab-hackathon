import type {
  AlliedCity,
  AlliedSpawnZone,
  MobilePlatform,
  PlatformClass,
  Weapon,
} from "../models/entity";
import { distanceKm } from "../models/distance";
import {
  isAlliedBaseDeploymentDisabled,
  type DebugSettings,
} from "../models/debug";
import { getMissionFuelBudgetSeconds } from "../models/platform-recovery";
import {
  getPlatformDisplayName,
  getPrimaryPayloadWeapon,
  getPlatformTargetType,
  getWeaponPayloadDamage,
  hasUsableAmmo,
  isPlatformDeployed,
  isPlatformDestroyed,
  isPlatformStored,
  weaponSupportsTarget,
} from "../models/platform-utils";
import { getPlatformTransitSpeed, predictIntercept } from "./intercept";
import {
  applyPostureMemory,
  evaluateAlliedForcePosture,
  getAlliedCoverageScoreForCity,
  type AlliedForcePostureSnapshot,
  type TeamPostureMemory,
} from "./posture";
import {
  generatePlannerCandidates,
  runPortfolioPlanner,
  type ResponsePlannerSnapshot,
} from "./planning";

export type ResourceMission = "intercept" | "reinforce";

export type ResourceAssignment = {
  mission: ResourceMission;
  targetId: string;
  targetName: string;
  resourceId: string;
  resourceName: string;
  distance: number;
  threatScore: number;
  priorityScore: number;
  reason: string;
  interceptTimeSeconds?: number;
  weaponName?: string;
  weaponClass?: Weapon["weaponClass"];
  expectedEffectiveness?: number;
};

export type AllocationResult = {
  assignments: ResourceAssignment[];
  postureMemory: TeamPostureMemory;
  postureSnapshot: AlliedForcePostureSnapshot;
  plannerSnapshot: ResponsePlannerSnapshot;
};

type OriginReserve = {
  totalStored: number;
  byClass: Record<PlatformClass, number>;
};

const interceptFuelCommitmentBufferSeconds = 3;
const reinforcementFuelCommitmentBufferSeconds = 6;

function isPlatformAvailable(
  platform: MobilePlatform,
  debugSettings: DebugSettings,
): boolean {
  if (platform.team !== "allied") {
    return false;
  }

  if (isPlatformDestroyed(platform) || platform.engagedWithId) {
    return false;
  }

  if (
    platform.status === "returning" ||
    platform.status === "destroyed" ||
    platform.deploymentDelaySeconds > 0
  ) {
    return false;
  }

  if (
    isPlatformStored(platform) &&
    isAlliedBaseDeploymentDisabled(debugSettings, platform.originId)
  ) {
    return false;
  }

  return platform.enduranceSeconds > 8;
}

function hasAmmo(weapon: Weapon): boolean {
  return hasUsableAmmo(weapon);
}

function createOriginReserve(): OriginReserve {
  return {
    totalStored: 0,
    byClass: {
      fighterJet: 0,
      drone: 0,
      ballisticMissile: 0,
    },
  };
}

function getStoredReserveByOrigin(
  alliedPlatforms: MobilePlatform[],
): Record<string, OriginReserve> {
  const reservesByOrigin: Record<string, OriginReserve> = {};

  for (const platform of alliedPlatforms) {
    if (!platform.originId || !isPlatformStored(platform)) {
      continue;
    }

    const reserve = reservesByOrigin[platform.originId] ?? createOriginReserve();
    reserve.totalStored += 1;
    reserve.byClass[platform.platformClass] += 1;
    reservesByOrigin[platform.originId] = reserve;
  }

  return reservesByOrigin;
}

function getClassReserveFloor(platformClass: PlatformClass): number {
  switch (platformClass) {
    case "drone":
      return 2;
    case "fighterJet":
      return 1;
    case "ballisticMissile":
      return 1;
    default:
      return 1;
  }
}

function getReservePenalty(
  alliedPlatform: MobilePlatform,
  storedReserveByOrigin: Record<string, OriginReserve>,
): number {
  if (!isPlatformStored(alliedPlatform) || !alliedPlatform.originId) {
    return 0;
  }

  const reserve = storedReserveByOrigin[alliedPlatform.originId];
  if (!reserve) {
    return alliedPlatform.platformClass === "ballisticMissile" ? 4.2 : 2.8;
  }

  const classReserve = reserve.byClass[alliedPlatform.platformClass];
  const classFloor = getClassReserveFloor(alliedPlatform.platformClass);
  let penalty = 0;

  if (classReserve <= classFloor) {
    penalty +=
      alliedPlatform.platformClass === "ballisticMissile"
        ? 5
        : alliedPlatform.platformClass === "fighterJet"
          ? 3.4
          : 2.4;
  }

  if (reserve.totalStored <= 3) {
    penalty += 3.1;
  }

  if (alliedPlatform.platformClass === "ballisticMissile") {
    penalty += 1.8;
  }

  return penalty;
}

function consumeStoredReserve(
  alliedPlatform: MobilePlatform,
  storedReserveByOrigin: Record<string, OriginReserve>,
): void {
  if (!isPlatformStored(alliedPlatform) || !alliedPlatform.originId) {
    return;
  }

  const reserve = storedReserveByOrigin[alliedPlatform.originId];
  if (!reserve) {
    return;
  }

  reserve.totalStored = Math.max(0, reserve.totalStored - 1);
  reserve.byClass[alliedPlatform.platformClass] = Math.max(
    0,
    reserve.byClass[alliedPlatform.platformClass] - 1,
  );
}

function getReserveContext(
  alliedPlatform: MobilePlatform,
  storedReserveByOrigin: Record<string, OriginReserve>,
): string {
  if (!isPlatformStored(alliedPlatform)) {
    return "It is already airborne, so the assignment does not draw down tucked reserve.";
  }

  if (!alliedPlatform.originId) {
    return "It is the lightest available reserve draw.";
  }

  const reserve = storedReserveByOrigin[alliedPlatform.originId];
  if (!reserve) {
    return "It is the lightest available reserve draw.";
  }

  const classReserve = reserve.byClass[alliedPlatform.platformClass];
  const classFloor = getClassReserveFloor(alliedPlatform.platformClass);

  if (classReserve > classFloor && reserve.totalStored > 3) {
    return "Its origin base still keeps credible reserve after launch.";
  }

  return "It is the least damaging reserve draw among the remaining tucked platforms.";
}

function getUsableWeaponsForTarget(
  platform: MobilePlatform,
  targetType: ReturnType<typeof getPlatformTargetType>,
): Weapon[] {
  return platform.weapons.filter(
    (weapon) =>
      hasAmmo(weapon) &&
      weapon.cooldown <= 0 &&
      weaponSupportsTarget(weapon, targetType),
  );
}

function getCityById(cities: AlliedCity[], cityId: string | undefined): AlliedCity | undefined {
  if (!cityId) {
    return undefined;
  }

  return cities.find((city) => city.id === cityId);
}

function getInterceptPriority(
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
): number {
  const targetCity = getCityById(cities, enemyPlatform.targetId);
  const targetValue = targetCity?.value ?? 5;
  const payloadThreat = enemyPlatform.platformClass === "ballisticMissile" ? 1.35 : 1;

  return enemyPlatform.threatLevel * targetValue * payloadThreat;
}

function getReinforcementPriority(city: AlliedCity): number {
  return city.value * (1 + city.threat * 95);
}

function getWeaponEffectiveness(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
  weapon: Weapon,
): number {
  const signatureModifier = 0.65 + enemyPlatform.combat.signature * 0.4;
  const evasionModifier = Math.max(0.22, 1 - enemyPlatform.combat.evasion * 0.52);
  const trackingModifier =
    0.72 + alliedPlatform.sensors.trackingQuality * 0.35;
  const interceptPenalty =
    enemyPlatform.platformClass === "ballisticMissile"
      ? 1 - (enemyPlatform.interceptDifficulty ?? 0) * 0.45
      : 1;
  const hitChance = Math.max(
    0.1,
    Math.min(
      0.98,
      weapon.accuracy *
        (weapon.probabilityOfKillBase ?? 1) *
        signatureModifier *
        evasionModifier *
        trackingModifier *
        interceptPenalty,
    ),
  );
  const damageWeight =
    (weapon.damagePerHit * (weapon.salvoSize ?? 1)) /
    Math.max(40, enemyPlatform.combat.maxDurability);

  return hitChance * Math.min(1.4, damageWeight + 0.35);
}

function getTerminalImpactEffectiveness(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
): number {
  const payloadWeapon =
    getPrimaryPayloadWeapon(alliedPlatform, getPlatformTargetType(enemyPlatform)) ??
    getPrimaryPayloadWeapon(alliedPlatform);
  if (!payloadWeapon) {
    return 0;
  }

  const baseDamage = getWeaponPayloadDamage(payloadWeapon);
  const damageWeight =
    (baseDamage * 1.2) / Math.max(40, enemyPlatform.combat.maxDurability);
  const terminalModifier =
    enemyPlatform.platformClass === "ballisticMissile"
      ? 1.18
      : enemyPlatform.platformClass === "fighterJet"
        ? 1.06
        : 1;
  const survivabilityModifier =
    0.76 + (1 - enemyPlatform.combat.evasion * 0.4) * 0.24;

  return Math.min(
    1.7,
    Math.max(0.45, damageWeight * terminalModifier * survivabilityModifier),
  );
}

function selectBestWeapon(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
): { weapon: Weapon; effectiveness: number } | undefined {
  const targetType = getPlatformTargetType(enemyPlatform);
  const usableWeapons = getUsableWeaponsForTarget(alliedPlatform, targetType);
  if (usableWeapons.length === 0) {
    return undefined;
  }

  let selected: Weapon | undefined;
  let bestEffectiveness = Number.NEGATIVE_INFINITY;

  for (const weapon of usableWeapons) {
    const effectiveness = getWeaponEffectiveness(
      alliedPlatform,
      enemyPlatform,
      weapon,
    );
    if (effectiveness > bestEffectiveness) {
      bestEffectiveness = effectiveness;
      selected = weapon;
    }
  }

  if (!selected) {
    return undefined;
  }

  return {
    weapon: selected,
    effectiveness: bestEffectiveness,
  };
}

function canReinforce(
  alliedPlatform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  debugSettings: DebugSettings,
): boolean {
  return (
    !alliedPlatform.oneWay &&
    isPlatformAvailable(alliedPlatform, debugSettings) &&
    alliedPlatform.weapons.some((weapon) => hasAmmo(weapon)) &&
    getMissionFuelBudgetSeconds(alliedPlatform, alliedSpawnZones, []) >
      reinforcementFuelCommitmentBufferSeconds
  );
}

function allocateHeuristicResources(
  cities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
  postureSnapshot: AlliedForcePostureSnapshot,
  debugSettings: DebugSettings,
): ResourceAssignment[] {
  const assignments: ResourceAssignment[] = [];
  const reservedPlatformIds = new Set<string>();
  const storedReserveByOrigin = getStoredReserveByOrigin(alliedPlatforms);
  const activeEnemyPlatforms = enemyPlatforms.filter((enemyPlatform) =>
    isPlatformDeployed(enemyPlatform),
  );
  const sortedEnemyPlatforms = [...activeEnemyPlatforms].sort(
    (a, b) => getInterceptPriority(b, cities) - getInterceptPriority(a, cities),
  );

  for (const enemyPlatform of sortedEnemyPlatforms) {
    const priorityScore = getInterceptPriority(enemyPlatform, cities);
    let bestPlatform: MobilePlatform | undefined;
    let bestWeapon: Weapon | undefined;
    let bestInterceptDistance = Number.POSITIVE_INFINITY;
    let bestInterceptTime = Number.POSITIVE_INFINITY;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestEffectiveness = 0;
    let bestReserveContext = "";

    for (const alliedPlatform of alliedPlatforms) {
      if (
        reservedPlatformIds.has(alliedPlatform.id) ||
        !isPlatformAvailable(alliedPlatform, debugSettings)
      ) {
        continue;
      }

      const weaponSelection = selectBestWeapon(alliedPlatform, enemyPlatform);
      if (!weaponSelection) {
        continue;
      }

      const intercept = predictIntercept(
        alliedPlatform,
        enemyPlatform,
        cities,
      );
      if (!intercept?.feasibleBeforeImpact || !intercept.acquisitionFeasible) {
        continue;
      }

      const enduranceMargin = Math.max(
        0,
        getMissionFuelBudgetSeconds(alliedPlatform, alliedSpawnZones, []) -
          intercept.timeToIntercept,
      );
      if (enduranceMargin <= interceptFuelCommitmentBufferSeconds) {
        continue;
      }
      const reservePenalty = getReservePenalty(
        alliedPlatform,
        storedReserveByOrigin,
      );
      const launchPressurePenalty =
        isPlatformStored(alliedPlatform) && postureSnapshot.surplusScore > 0
          ? postureSnapshot.surplusScore *
            (postureSnapshot.recallPressureActive ? 1.2 : 0.75)
          : 0;
      const platformEffectiveness = weaponSelection
        ? alliedPlatform.oneWay
          ? getTerminalImpactEffectiveness(alliedPlatform, enemyPlatform)
          : weaponSelection.effectiveness
        : 0;

      const score =
        priorityScore * 1.3 +
        platformEffectiveness *
          (alliedPlatform.oneWay ? 14 : 12) +
        alliedPlatform.sensors.sensorRange / 50 -
        intercept.timeToIntercept * 1.1 -
        reservePenalty -
        launchPressurePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestPlatform = alliedPlatform;
        bestWeapon = weaponSelection?.weapon;
        bestInterceptDistance = intercept.distance;
        bestInterceptTime = intercept.timeToIntercept;
        bestEffectiveness = platformEffectiveness;
        bestReserveContext = getReserveContext(
          alliedPlatform,
          storedReserveByOrigin,
        );
      }
    }

    if (!bestPlatform || !bestWeapon) {
      continue;
    }

    reservedPlatformIds.add(bestPlatform.id);
    consumeStoredReserve(bestPlatform, storedReserveByOrigin);
    assignments.push({
      mission: "intercept",
      targetId: enemyPlatform.id,
      targetName: getPlatformDisplayName(enemyPlatform),
      resourceId: bestPlatform.id,
      resourceName: getPlatformDisplayName(bestPlatform),
      distance: bestInterceptDistance,
      threatScore: enemyPlatform.threatLevel,
      priorityScore,
      interceptTimeSeconds: bestInterceptTime,
      weaponName: bestWeapon?.name ?? "Terminal Impact Run",
      weaponClass: bestWeapon?.weaponClass,
      expectedEffectiveness: bestEffectiveness,
      reason:
        bestPlatform.oneWay
          ? `${getPlatformDisplayName(bestPlatform)} is committed to a terminal intercept against ` +
            `${getPlatformDisplayName(enemyPlatform)}. It will expend its terminal payload in a one-way attack run, ` +
            `inflict critical damage, and be lost in the process. Impact timing and payload yield make it the strongest ` +
            `last-ditch kill option. ${bestReserveContext}`
          : `${getPlatformDisplayName(bestPlatform)} can acquire and intercept ` +
            `${getPlatformDisplayName(enemyPlatform)} before city impact using ` +
            `${bestWeapon?.name ?? "its selected weapon"}. Sensor reach, endurance margin, and weapon match ` +
            `outperform the other available platforms. ${bestReserveContext}`,
    });
  }

  if (activeEnemyPlatforms.length === 0) {
    return assignments;
  }

  const cityPostureById = new Map(
    postureSnapshot.cityStates.map((cityState) => [cityState.cityId, cityState]),
  );
  const sortedCities = [...cities]
    .map((city) => ({
      city,
      cityPosture: cityPostureById.get(city.id),
    }))
    .filter(({ city, cityPosture }) => {
      if (!cityPosture) {
        return city.threat > 0.0025;
      }

      if (cityPosture.activeThreatCount > 0 || cityPosture.inboundPressure >= 0.9) {
        return true;
      }

      if (postureSnapshot.stance === "surging") {
        return cityPosture.unmetCoverage >= 0.2;
      }

      return cityPosture.unmetCoverage >= 0.75;
    })
    .sort((a, b) => {
      const leftScore =
        (a.cityPosture?.unmetCoverage ?? 0) * 3.2 +
        (a.cityPosture?.demandScore ?? getReinforcementPriority(a.city));
      const rightScore =
        (b.cityPosture?.unmetCoverage ?? 0) * 3.2 +
        (b.cityPosture?.demandScore ?? getReinforcementPriority(b.city));

      return rightScore - leftScore;
    });

  for (const { city, cityPosture } of sortedCities) {
    if (
      cityPosture &&
      postureSnapshot.recallPressureActive &&
      cityPosture.unmetCoverage < 1.1 &&
      cityPosture.activeThreatCount === 0
    ) {
      continue;
    }

    const priorityScore = getReinforcementPriority(city);
    let bestPlatform: MobilePlatform | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestReserveContext = "";

    for (const alliedPlatform of alliedPlatforms) {
      if (
        reservedPlatformIds.has(alliedPlatform.id) ||
        !canReinforce(alliedPlatform, alliedSpawnZones, debugSettings)
      ) {
        continue;
      }

      const distance = distanceKm(alliedPlatform.position, city.position);
      const travelTimeToCity =
        distance / Math.max(1, getPlatformTransitSpeed(alliedPlatform));
      if (
        getMissionFuelBudgetSeconds(alliedPlatform, alliedSpawnZones, []) <=
        travelTimeToCity + reinforcementFuelCommitmentBufferSeconds
      ) {
        continue;
      }
      const reservePenalty = getReservePenalty(
        alliedPlatform,
        storedReserveByOrigin,
      );
      const localCoverage = getAlliedCoverageScoreForCity(alliedPlatform, city);
      const launchPressurePenalty =
        isPlatformStored(alliedPlatform) && postureSnapshot.surplusScore > 0
          ? postureSnapshot.surplusScore *
            (postureSnapshot.recallPressureActive ? 2.2 : 1.4)
          : 0;
      const unmetCoverage = cityPosture?.unmetCoverage ?? Math.max(0, city.threat * 120);
      if (
        isPlatformStored(alliedPlatform) &&
        !postureSnapshot.launchReleaseActive &&
        postureSnapshot.stance !== "surging" &&
        unmetCoverage < 1.4
      ) {
        continue;
      }

      if (
        isPlatformStored(alliedPlatform) &&
        postureSnapshot.recallPressureActive &&
        unmetCoverage < 0.55
      ) {
        continue;
      }

      const score =
        unmetCoverage * 8.5 +
        localCoverage * 1.8 +
        alliedPlatform.sensors.sensorRange / 65 +
        alliedPlatform.enduranceSeconds / 45 -
        distance / 70 +
        city.threat * 18 +
        (isPlatformStored(alliedPlatform) ? 0.2 : 1.1) -
        (reservePenalty * 1.15) -
        launchPressurePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestDistance = distance;
        bestPlatform = alliedPlatform;
        bestReserveContext = getReserveContext(
          alliedPlatform,
          storedReserveByOrigin,
        );
      }
    }

    if (!bestPlatform) {
      continue;
    }

    reservedPlatformIds.add(bestPlatform.id);
    consumeStoredReserve(bestPlatform, storedReserveByOrigin);
    assignments.push({
      mission: "reinforce",
      targetId: city.id,
      targetName: city.name ?? city.id,
      resourceId: bestPlatform.id,
      resourceName: getPlatformDisplayName(bestPlatform),
      distance: bestDistance,
      threatScore: city.threat,
      priorityScore,
      expectedEffectiveness: bestScore,
      reason:
        `${getPlatformDisplayName(bestPlatform)} is holding a defensive posture ` +
        `over ${city.name ?? city.id} because it has strong sensor coverage, ` +
        `remaining endurance, and the best local response time for inbound threats. ` +
        `${postureSnapshot.summary} ${bestReserveContext}`,
    });
  }

  return assignments;
}

export function allocateResources(
  cities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
  postureMemory: TeamPostureMemory,
  deltaSeconds: number,
  debugSettings: DebugSettings,
): AllocationResult {
  const posture = applyPostureMemory(
    evaluateAlliedForcePosture(
      cities,
      alliedSpawnZones,
      alliedPlatforms,
      enemyPlatforms,
    ),
    postureMemory,
    deltaSeconds,
    {
      surplusThreshold: 2.15,
      demandGapThreshold: 1.15,
    },
  );
  const postureSnapshot = posture.snapshot;
  const heuristicAssignments = allocateHeuristicResources(
    cities,
    alliedSpawnZones,
    alliedPlatforms,
    enemyPlatforms,
    postureSnapshot,
    debugSettings,
  );
  const plannerInputs = generatePlannerCandidates({
    cities,
    alliedSpawnZones,
    alliedPlatforms,
    enemyPlatforms,
    postureSnapshot,
    debugSettings,
  });
  const plannedResult = runPortfolioPlanner({
    candidates: plannerInputs.candidates,
    postureSnapshot,
  });
  const plannerSnapshot: ResponsePlannerSnapshot = plannedResult
    ? {
        ...plannedResult.snapshot,
        beliefSummaries: plannerInputs.beliefs
          .slice(0, 4)
          .map((belief) => ({
            enemyId: belief.enemyId,
            targetName: belief.mostLikelyCityName,
            confidence: belief.confidence,
          })),
      }
    : {
        mode: "heuristic-fallback",
        objectiveScore: heuristicAssignments.reduce(
          (sum, assignment) => sum + assignment.priorityScore,
          0,
        ),
        consideredActionCount: plannerInputs.candidates.length,
        selectedActionCount: heuristicAssignments.length,
        primaryRationale:
          "The planner did not find a confident action bundle, so the heuristic allocator remained in control.",
        beliefSummaries: plannerInputs.beliefs.slice(0, 4).map((belief) => ({
          enemyId: belief.enemyId,
          targetName: belief.mostLikelyCityName,
          confidence: belief.confidence,
        })),
      };

  return {
    assignments: plannedResult?.assignments.length
      ? plannedResult.assignments
      : heuristicAssignments,
    postureMemory: posture.memory,
    postureSnapshot,
    plannerSnapshot,
  };
}
