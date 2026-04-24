import type {
  AlliedCity,
  MobilePlatform,
  PlatformClass,
  Weapon,
} from "../models/entity";
import {
  distanceBetween,
  getPlatformDisplayName,
  getPlatformTargetType,
  getUsableAmmoCost,
  isPlatformDeployed,
  isPlatformDestroyed,
  isPlatformStored,
  weaponSupportsTarget,
} from "../models/platform-utils";
import { predictIntercept } from "./intercept";

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
};

type OriginReserve = {
  totalStored: number;
  byClass: Record<PlatformClass, number>;
};

function isPlatformAvailable(platform: MobilePlatform): boolean {
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

  return platform.enduranceSeconds > 8;
}

function hasAmmo(weapon: Weapon): boolean {
  return weapon.ammunition >= getUsableAmmoCost(weapon);
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

function canReinforce(alliedPlatform: MobilePlatform): boolean {
  return (
    isPlatformAvailable(alliedPlatform) &&
    alliedPlatform.weapons.some((weapon) => hasAmmo(weapon))
  );
}

export function allocateResources(
  cities: AlliedCity[],
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
): AllocationResult {
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
        !isPlatformAvailable(alliedPlatform)
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
        alliedPlatform.enduranceSeconds - intercept.timeToIntercept,
      );
      if (enduranceMargin <= 4) {
        continue;
      }
      const reservePenalty = getReservePenalty(
        alliedPlatform,
        storedReserveByOrigin,
      );

      const score =
        priorityScore * 1.3 +
        weaponSelection.effectiveness * 12 +
        alliedPlatform.sensors.sensorRange / 50 -
        intercept.timeToIntercept * 1.1 -
        reservePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestPlatform = alliedPlatform;
        bestWeapon = weaponSelection.weapon;
        bestInterceptDistance = intercept.distance;
        bestInterceptTime = intercept.timeToIntercept;
        bestEffectiveness = weaponSelection.effectiveness;
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
      weaponName: bestWeapon.name,
      weaponClass: bestWeapon.weaponClass,
      expectedEffectiveness: bestEffectiveness,
      reason:
        `${getPlatformDisplayName(bestPlatform)} can acquire and intercept ` +
        `${getPlatformDisplayName(enemyPlatform)} before city impact using ` +
        `${bestWeapon.name}. Sensor reach, endurance margin, and weapon match ` +
        `outperform the other available platforms. ${bestReserveContext}`,
    });
  }

  if (activeEnemyPlatforms.length === 0) {
    return { assignments };
  }

  const threatenedCityIds = new Set(
    activeEnemyPlatforms
      .map((enemyPlatform) => enemyPlatform.targetId)
      .filter((targetId): targetId is string => Boolean(targetId)),
  );
  const sortedCities = [...cities]
    .filter(
      (city) => threatenedCityIds.has(city.id) || city.threat > 0.0025,
    )
    .sort(
    (a, b) => getReinforcementPriority(b) - getReinforcementPriority(a),
    );

  for (const city of sortedCities) {
    const priorityScore = getReinforcementPriority(city);
    let bestPlatform: MobilePlatform | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestReserveContext = "";

    for (const alliedPlatform of alliedPlatforms) {
      if (
        reservedPlatformIds.has(alliedPlatform.id) ||
        !canReinforce(alliedPlatform)
      ) {
        continue;
      }

      const distance = distanceBetween(alliedPlatform.position, city.position);
      const reservePenalty = getReservePenalty(
        alliedPlatform,
        storedReserveByOrigin,
      );
      const score =
        alliedPlatform.sensors.sensorRange / 65 +
        alliedPlatform.enduranceSeconds / 45 -
        distance / 70 +
        city.threat * 18 +
        (isPlatformStored(alliedPlatform) ? 0.2 : 1.1) -
        (reservePenalty * 1.15);

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
        `${bestReserveContext}`,
    });
  }

  return { assignments };
}
