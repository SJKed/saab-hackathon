import { createEnemyPlatforms } from "../../data/platform-factories";
import type { MapBounds } from "../../data/loader";
import { getPlatformTransitSpeed } from "../../engine/intercept";
import type {
  AlliedCity,
  EnemyBase,
  MobilePlatform,
} from "../../models/entity";
import {
  clonePlatform,
  isPlatformStored,
} from "../../models/platform-utils";
import {
  applyPassiveStateUpdates,
  hasRemainingAmmo,
  maneuverAgainstTarget,
  minimumDistanceToTarget,
  movePlatformTowards,
  routePlatformToClosestBase,
  transitionCombatPhase,
} from "./shared";
import { getTargetCity } from "./targeting";

export function createEnemyDeployments(
  enemyBases: EnemyBase[],
  cities: AlliedCity[],
): MobilePlatform[] {
  return createEnemyPlatforms(enemyBases, cities);
}

export function updateEnemyPositions(
  enemyPlatforms: MobilePlatform[],
  alliedPlatforms: MobilePlatform[],
  cities: AlliedCity[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform[] {
  if (deltaSeconds <= 0) {
    return enemyPlatforms.map(clonePlatform);
  }

  return enemyPlatforms.map((currentPlatform) => {
    const platform = applyPassiveStateUpdates(
      clonePlatform(currentPlatform),
      [],
      enemyBases,
      deltaSeconds,
    );

    if (platform.status === "destroyed") {
      return platform;
    }

    if (isPlatformStored(platform)) {
      if (platform.deploymentDelaySeconds > 0) {
        return {
          ...platform,
          velocity: { x: 0, y: 0 },
        };
      }

      const targetCity = getTargetCity(platform, cities);
      if (!targetCity) {
        return {
          ...platform,
          velocity: { x: 0, y: 0 },
        };
      }

      return movePlatformTowards(
        {
          ...platform,
          status: "transit",
          targetId: targetCity.id,
          deploymentDelaySeconds: 0,
        },
        targetCity.position,
        minimumDistanceToTarget,
        platform.oneWay ? platform.maxSpeed : getPlatformTransitSpeed(platform),
        deltaSeconds,
        bounds,
      );
    }

    if (platform.engagedWithId) {
      const engagedTarget = alliedPlatforms.find(
        (alliedPlatform) => alliedPlatform.id === platform.engagedWithId,
      );
      if (engagedTarget) {
        return maneuverAgainstTarget(platform, engagedTarget, deltaSeconds, bounds);
      }

      return transitionCombatPhase(
        {
          ...platform,
          status: "transit",
          velocity: { x: 0, y: 0 },
        },
        undefined,
        {
          engagedWithId: undefined,
        },
      );
    }

    if (platform.status === "returning" || !hasRemainingAmmo(platform)) {
      return routePlatformToClosestBase(platform, [], enemyBases, deltaSeconds, bounds);
    }

    const targetCity = getTargetCity(platform, cities);
    if (!targetCity) {
      return routePlatformToClosestBase(platform, [], enemyBases, deltaSeconds, bounds);
    }

    return movePlatformTowards(
      { ...platform, status: "transit", targetId: targetCity.id },
      targetCity.position,
      minimumDistanceToTarget,
      platform.oneWay ? platform.maxSpeed : getPlatformTransitSpeed(platform),
      deltaSeconds,
      bounds,
    );
  });
}
