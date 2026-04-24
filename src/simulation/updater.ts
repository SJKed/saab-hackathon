import { createEnemyPlatforms } from "../data/platform-factories";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  Vector,
} from "../models/entity";
import { ENEMY_DEPLOYMENT_HOLD_SECONDS } from "../models/platform-constants";
import {
  clonePlatform,
  distanceBetween,
  getUsableAmmoCost,
  isPlatformStored,
  isPlatformDestroyed,
} from "../models/platform-utils";
import type { ResourceAssignment } from "../engine/allocation";
import { getPlatformTransitSpeed, predictIntercept } from "../engine/intercept";

const minimumDistanceToTarget = 8;
const minimumDistanceToAssignmentTarget = 10;
const minimumReturnDistance = 10;

function getRedeploymentDelaySeconds(platform: MobilePlatform): number {
  if (platform.team === "allied") {
    return 0;
  }

  return ENEMY_DEPLOYMENT_HOLD_SECONDS;
}

function getOriginPosition(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): Vector | undefined {
  if (!platform.originId) {
    return undefined;
  }

  if (platform.team === "allied") {
    return alliedSpawnZones.find((zone) => zone.id === platform.originId)?.position;
  }

  return enemyBases.find((base) => base.id === platform.originId)?.position;
}

function refreshWeapons(
  platform: MobilePlatform,
  deltaSeconds: number,
): MobilePlatform["weapons"] {
  return platform.weapons.map((weapon) => ({
    ...weapon,
    cooldown: Math.max(0, weapon.cooldown - deltaSeconds),
  }));
}

function hasRemainingAmmo(platform: MobilePlatform): boolean {
  if (platform.oneWay) {
    return true;
  }

  return platform.weapons.some(
    (weapon) => weapon.ammunition >= getUsableAmmoCost(weapon),
  );
}

function applyPassiveStateUpdates(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
): MobilePlatform {
  if (isPlatformDestroyed(platform)) {
    return {
      ...platform,
      velocity: { x: 0, y: 0 },
      status: "destroyed",
      combat: {
        ...platform.combat,
        durability: 0,
      },
      weapons: refreshWeapons(platform, deltaSeconds),
    };
  }

  const refreshedWeapons = refreshWeapons(platform, deltaSeconds);
  const isAirborne =
    platform.status !== "stored" &&
    platform.status !== "idle" &&
    platform.status !== "destroyed";
  const enduranceSeconds = Math.max(
    0,
    platform.enduranceSeconds - (isAirborne ? deltaSeconds : 0),
  );

  let nextPlatform: MobilePlatform = {
    ...platform,
    enduranceSeconds,
    deploymentDelaySeconds: isPlatformStored(platform)
      ? Math.max(0, platform.deploymentDelaySeconds - deltaSeconds)
      : platform.deploymentDelaySeconds,
    weapons: refreshedWeapons,
  };

  if (
    !nextPlatform.oneWay &&
    !isPlatformStored(nextPlatform) &&
    enduranceSeconds <= 8 &&
    !nextPlatform.engagedWithId
  ) {
    nextPlatform = {
      ...nextPlatform,
      status: "returning",
      targetId: nextPlatform.originId,
    };
  }

  const originPosition = getOriginPosition(
    nextPlatform,
    alliedSpawnZones,
    enemyBases,
  );
  if (!originPosition) {
    return nextPlatform;
  }

  const distanceToOrigin = distanceBetween(nextPlatform.position, originPosition);
  if (
    distanceToOrigin <= minimumReturnDistance &&
    (nextPlatform.status === "returning" || nextPlatform.status === "idle")
  ) {
    return {
      ...nextPlatform,
      position: { ...originPosition },
      velocity: { x: 0, y: 0 },
      status: "stored",
      targetId: undefined,
      engagedWithId: undefined,
      enduranceSeconds: nextPlatform.maxEnduranceSeconds,
      deploymentDelaySeconds: getRedeploymentDelaySeconds(nextPlatform),
      weapons: nextPlatform.weapons.map((weapon) => ({
        ...weapon,
        ammunition: weapon.maxAmmunition,
        cooldown: 0,
      })),
    };
  }

  return nextPlatform;
}

function movePlatformTowards(
  platform: MobilePlatform,
  targetPosition: Vector,
  minDistance: number,
  speedOverride: number | undefined,
  deltaSeconds: number,
): MobilePlatform {
  const dx = targetPosition.x - platform.position.x;
  const dy = targetPosition.y - platform.position.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= minDistance) {
    return {
      ...platform,
      velocity: { x: 0, y: 0 },
      position: { ...platform.position },
    };
  }

  const directionX = dx / distance;
  const directionY = dy / distance;
  const speed = speedOverride ?? getPlatformTransitSpeed(platform);
  const movementStep = Math.min(speed * deltaSeconds, distance - minDistance);

  return {
    ...platform,
    velocity: {
      x: directionX * speed,
      y: directionY * speed,
    },
    position: {
      x: platform.position.x + directionX * movementStep,
      y: platform.position.y + directionY * movementStep,
    },
  };
}

function getTargetCity(
  platform: MobilePlatform,
  cities: AlliedCity[],
): AlliedCity | undefined {
  if (platform.targetId) {
    const matchedTarget = cities.find((city) => city.id === platform.targetId);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  let nearestCity: AlliedCity | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const currentDistance = distanceBetween(platform.position, city.position);
    if (currentDistance < nearestDistance) {
      nearestDistance = currentDistance;
      nearestCity = city;
    }
  }

  return nearestCity;
}

function getAssignmentTarget(
  platform: MobilePlatform,
  assignment: ResourceAssignment,
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): Vector | undefined {
  if (assignment.mission === "intercept") {
    const enemyPlatform = enemyPlatforms.find(
      (enemy) => enemy.id === assignment.targetId,
    );
    if (!enemyPlatform) {
      return undefined;
    }

    return predictIntercept(platform, enemyPlatform, cities)?.point ?? enemyPlatform.position;
  }

  return cities.find((city) => city.id === assignment.targetId)?.position;
}

export function createEnemyDeployments(
  enemyBases: EnemyBase[],
  cities: AlliedCity[],
): MobilePlatform[] {
  return createEnemyPlatforms(enemyBases, cities);
}

export function updateEnemyPositions(
  enemyPlatforms: MobilePlatform[],
  cities: AlliedCity[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
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
      );
    }

    if (platform.engagedWithId) {
      return {
        ...platform,
        status: "engaging",
        velocity: { x: 0, y: 0 },
      };
    }

    if (!platform.oneWay && (platform.status === "returning" || !hasRemainingAmmo(platform))) {
      const originPosition = getOriginPosition(platform, [], enemyBases);
      if (!originPosition) {
        return platform;
      }

      return movePlatformTowards(
        { ...platform, status: "returning", targetId: platform.originId },
        originPosition,
        minimumReturnDistance,
        platform.cruiseSpeed,
        deltaSeconds,
      );
    }

    const targetCity = getTargetCity(platform, cities);
    if (!targetCity) {
      return {
        ...platform,
        velocity: { x: 0, y: 0 },
      };
    }

    const movedPlatform = movePlatformTowards(
      { ...platform, status: "transit", targetId: targetCity.id },
      targetCity.position,
      minimumDistanceToTarget,
      platform.oneWay ? platform.maxSpeed : getPlatformTransitSpeed(platform),
      deltaSeconds,
    );

    return movedPlatform;
  });
}

export function updateResourcePositions(
  alliedPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
  alliedSpawnZones: AlliedSpawnZone[],
  deltaSeconds: number,
): MobilePlatform[] {
  if (deltaSeconds <= 0) {
    return alliedPlatforms.map(clonePlatform);
  }

  return alliedPlatforms.map((currentPlatform) => {
    const platform = applyPassiveStateUpdates(
      clonePlatform(currentPlatform),
      alliedSpawnZones,
      [],
      deltaSeconds,
    );

    if (platform.status === "destroyed") {
      return platform;
    }

    if (isPlatformStored(platform)) {
      const assignment = assignments.find((item) => item.resourceId === platform.id);
      if (!assignment) {
        return {
          ...platform,
          velocity: { x: 0, y: 0 },
        };
      }

      const targetPosition = getAssignmentTarget(
        platform,
        assignment,
        cities,
        enemyPlatforms,
      );
      if (!targetPosition) {
        return {
          ...platform,
          velocity: { x: 0, y: 0 },
        };
      }

      const nextStatus =
        assignment.mission === "intercept" ? "intercepting" : "reinforcing";
      return movePlatformTowards(
        {
          ...platform,
          status: nextStatus,
          targetId: assignment.targetId,
          deploymentDelaySeconds: 0,
        },
        targetPosition,
        minimumDistanceToAssignmentTarget,
        getPlatformTransitSpeed(platform),
        deltaSeconds,
      );
    }

    if (platform.engagedWithId) {
      return {
        ...platform,
        status: "engaging",
        velocity: { x: 0, y: 0 },
      };
    }

    if (!hasRemainingAmmo(platform) && !platform.oneWay) {
      const originPosition = getOriginPosition(platform, alliedSpawnZones, []);
      if (!originPosition) {
        return platform;
      }

      return movePlatformTowards(
        { ...platform, status: "returning", targetId: platform.originId },
        originPosition,
        minimumReturnDistance,
        platform.cruiseSpeed,
        deltaSeconds,
      );
    }

    const assignment = assignments.find((item) => item.resourceId === platform.id);
    if (!assignment) {
      const originPosition = getOriginPosition(platform, alliedSpawnZones, []);
      if (!originPosition) {
        return {
          ...platform,
          status: "stored",
          velocity: { x: 0, y: 0 },
        };
      }

      if (distanceBetween(platform.position, originPosition) <= minimumReturnDistance) {
        return {
          ...platform,
          position: { ...originPosition },
          status: "stored",
          velocity: { x: 0, y: 0 },
          targetId: undefined,
          engagedWithId: undefined,
          enduranceSeconds: platform.maxEnduranceSeconds,
          deploymentDelaySeconds: 0,
          weapons: platform.weapons.map((weapon) => ({
            ...weapon,
            ammunition: weapon.maxAmmunition,
            cooldown: 0,
          })),
        };
      }

      return movePlatformTowards(
        { ...platform, status: "returning", targetId: platform.originId },
        originPosition,
        minimumReturnDistance,
        platform.cruiseSpeed,
        deltaSeconds,
      );
    }

    const targetPosition = getAssignmentTarget(
      platform,
      assignment,
      cities,
      enemyPlatforms,
    );
    if (!targetPosition) {
      return {
        ...platform,
        status: "idle",
        velocity: { x: 0, y: 0 },
      };
    }

    const nextStatus =
      assignment.mission === "intercept" ? "intercepting" : "reinforcing";
    const updatedPlatform = movePlatformTowards(
      { ...platform, status: nextStatus, targetId: assignment.targetId },
      targetPosition,
      minimumDistanceToAssignmentTarget,
      getPlatformTransitSpeed(platform),
      deltaSeconds,
    );

    return updatedPlatform;
  });
}
