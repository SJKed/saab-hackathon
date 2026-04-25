import type {
  MapBounds,
} from "../../data/loader";
import type {
  AlliedSpawnZone,
  CombatPhase,
  EnemyBase,
  MobilePlatform,
  TargetType,
  Vector,
} from "../../models/entity";
import { ENEMY_DEPLOYMENT_HOLD_SECONDS } from "../../models/platform-constants";
import {
  getClosestRecoveryBase as findClosestRecoveryBase,
  hasReachedLatestSafeRecallMoment,
  recoveryArrivalDistance,
} from "../../models/platform-recovery";
import {
  distanceBetween,
  getPrimaryPayloadWeapon,
  getPlatformTargetType,
  getPreferredCombatRange,
  getWeaponBlastRadius,
  hasUsablePayload,
  isPlatformDestroyed,
  isPlatformStored,
} from "../../models/platform-utils";
import { getPlatformTransitSpeed, predictLeadIntercept } from "../../engine/intercept";

export const minimumDistanceToTarget = 8;
export const minimumDistanceToAssignmentTarget = 10;
export const minimumReturnDistance = recoveryArrivalDistance;
const oneWayTerminalHomingDistance = 22;
const oneWayLeadHorizonSeconds = 1.35;
const mapEdgePadding = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampPositionToBounds(position: Vector, bounds: MapBounds): Vector {
  return {
    x: clamp(position.x, bounds.minX + mapEdgePadding, bounds.maxX - mapEdgePadding),
    y: clamp(position.y, bounds.minY + mapEdgePadding, bounds.maxY - mapEdgePadding),
  };
}

function getPlatformSpeed(platform: MobilePlatform): number {
  return Math.hypot(platform.velocity.x, platform.velocity.y);
}

export function getRedeploymentDelaySeconds(platform: MobilePlatform): number {
  return platform.team === "allied" ? 0 : ENEMY_DEPLOYMENT_HOLD_SECONDS;
}

export function getOriginPosition(
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

export function getClosestRecoveryBase(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): { originId: string; position: Vector } | undefined {
  return findClosestRecoveryBase(platform, alliedSpawnZones, enemyBases);
}

export function refreshWeapons(
  platform: MobilePlatform,
  deltaSeconds: number,
): MobilePlatform["weapons"] {
  return platform.weapons.map((weapon) => ({
    ...weapon,
    cooldown: Math.max(0, weapon.cooldown - deltaSeconds),
  }));
}

export function hasRemainingAmmo(platform: MobilePlatform): boolean {
  return hasUsablePayload(platform);
}

function tryDockAtRecoveryBase(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): MobilePlatform | undefined {
  if (
    isPlatformDestroyed(platform) ||
    isPlatformStored(platform) ||
    platform.oneWay
  ) {
    return undefined;
  }

  const closestBase = getClosestRecoveryBase(platform, alliedSpawnZones, enemyBases);
  if (!closestBase) {
    return undefined;
  }

  const withinDockingRange =
    distanceBetween(platform.position, closestBase.position) <= minimumReturnDistance;
  if (!withinDockingRange) {
    return undefined;
  }

  return resetPlatformAtOrigin(
    {
      ...platform,
      originId: closestBase.originId,
    },
    closestBase.position,
  );
}

export function applyPassiveStateUpdates(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
  fuelBurnMultiplier: number,
): MobilePlatform {
  if (isPlatformDestroyed(platform)) {
    return {
      ...platform,
      velocity: { x: 0, y: 0 },
      status: "destroyed",
      combatPhase: undefined,
      combatPhaseTimeSeconds: 0,
      disengageReason: undefined,
      combat: {
        ...platform.combat,
        durability: 0,
      },
      weapons: refreshWeapons(platform, deltaSeconds),
    };
  }

  const dockedPlatform = tryDockAtRecoveryBase(
    platform,
    alliedSpawnZones,
    enemyBases,
  );
  if (dockedPlatform) {
    return dockedPlatform;
  }

  const refreshedWeapons = refreshWeapons(platform, deltaSeconds);
  const isAirborne =
    platform.status !== "stored" &&
    platform.status !== "idle" &&
    platform.status !== "destroyed";
  const enduranceSeconds = Math.max(
    0,
    platform.enduranceSeconds -
      (isAirborne ? deltaSeconds * Math.max(0, fuelBurnMultiplier) : 0),
  );
  if (isAirborne && enduranceSeconds <= 0) {
    return {
      ...platform,
      velocity: { x: 0, y: 0 },
      status: "destroyed",
      targetId: undefined,
      engagedWithId: undefined,
      combatPhase: undefined,
      combatPhaseTimeSeconds: 0,
      disengageReason: "Fuel exhausted before recovery",
      enduranceSeconds: 0,
      combat: {
        ...platform.combat,
        durability: 0,
      },
      weapons: refreshedWeapons,
    };
  }

  let nextPlatform: MobilePlatform = {
    ...platform,
    combatPhaseTimeSeconds: platform.combatPhase
      ? platform.combatPhaseTimeSeconds + deltaSeconds
      : 0,
    enduranceSeconds,
    deploymentDelaySeconds: isPlatformStored(platform)
      ? Math.max(0, platform.deploymentDelaySeconds - deltaSeconds)
      : platform.deploymentDelaySeconds,
    weapons: refreshedWeapons,
  };

  if (hasReachedLatestSafeRecallMoment(nextPlatform, alliedSpawnZones, enemyBases)) {
    nextPlatform = {
      ...nextPlatform,
      status: nextPlatform.engagedWithId ? nextPlatform.status : "returning",
      combatPhase: "disengaging",
      disengageReason: "Fuel low; returning while recovery window remains",
      targetId: nextPlatform.originId,
    };
  }

  const updatedDockedPlatform = tryDockAtRecoveryBase(
    nextPlatform,
    alliedSpawnZones,
    enemyBases,
  );
  if (updatedDockedPlatform) {
    return updatedDockedPlatform;
  }

  return nextPlatform;
}

export function movePlatformTowards(
  platform: MobilePlatform,
  targetPosition: Vector,
  minDistance: number,
  speedOverride: number | undefined,
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform {
  const clampedTargetPosition = clampPositionToBounds(targetPosition, bounds);
  const dx = clampedTargetPosition.x - platform.position.x;
  const dy = clampedTargetPosition.y - platform.position.y;
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
  const unclampedPosition = {
    x: platform.position.x + directionX * movementStep,
    y: platform.position.y + directionY * movementStep,
  };
  const clampedPosition = clampPositionToBounds(unclampedPosition, bounds);
  const actualStepX = clampedPosition.x - platform.position.x;
  const actualStepY = clampedPosition.y - platform.position.y;
  const actualStepDistance = Math.hypot(actualStepX, actualStepY);
  const resultingVelocity =
    deltaSeconds > 0 && actualStepDistance > 0
      ? {
          x: actualStepX / deltaSeconds,
          y: actualStepY / deltaSeconds,
        }
      : { x: 0, y: 0 };

  return {
    ...platform,
    velocity: resultingVelocity,
    position: clampedPosition,
  };
}

export function resetPlatformAtOrigin(
  platform: MobilePlatform,
  originPosition: Vector,
): MobilePlatform {
  return {
    ...platform,
    position: { ...originPosition },
    velocity: { x: 0, y: 0 },
    status: "stored",
    targetId: undefined,
    engagedWithId: undefined,
    combatPhase: undefined,
    combatPhaseTimeSeconds: 0,
    disengageReason: undefined,
    enduranceSeconds: platform.maxEnduranceSeconds,
    deploymentDelaySeconds: getRedeploymentDelaySeconds(platform),
    weapons: platform.weapons.map((weapon) => ({
      ...weapon,
      ammunition: weapon.maxAmmunition,
      cooldown: 0,
    })),
  };
}

export function routePlatformToClosestBase(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform {
  const closestBase = getClosestRecoveryBase(
    platform,
    alliedSpawnZones,
    enemyBases,
  );
  if (!closestBase) {
    return platform;
  }

  const returningPlatform = {
    ...platform,
    originId: closestBase.originId,
    targetId: closestBase.originId,
    status: "returning" as const,
  };
  const dockedPlatform = tryDockAtRecoveryBase(
    returningPlatform,
    alliedSpawnZones,
    enemyBases,
  );
  if (dockedPlatform) {
    return dockedPlatform;
  }

  return movePlatformTowards(
    returningPlatform,
    closestBase.position,
    minimumReturnDistance,
    returningPlatform.cruiseSpeed,
    deltaSeconds,
    bounds,
  );
}

function createDirectionPoint(
  platform: MobilePlatform,
  directionX: number,
  directionY: number,
  travelDistance: number,
): Vector {
  return {
    x: platform.position.x + directionX * travelDistance,
    y: platform.position.y + directionY * travelDistance,
  };
}

function moveAwayFromTarget(
  platform: MobilePlatform,
  targetPosition: Vector,
  travelDistance: number,
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform {
  const dx = platform.position.x - targetPosition.x;
  const dy = platform.position.y - targetPosition.y;
  const distance = Math.hypot(dx, dy);
  const directionX = distance > 0 ? dx / distance : 1;
  const directionY = distance > 0 ? dy / distance : 0;

  return movePlatformTowards(
    platform,
    createDirectionPoint(platform, directionX, directionY, travelDistance),
    0,
    getPlatformTransitSpeed(platform),
    deltaSeconds,
    bounds,
  );
}

function moveToCombatOffset(
  platform: MobilePlatform,
  target: MobilePlatform,
  desiredRange: number,
  lateralSign: number,
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform {
  const dx = platform.position.x - target.position.x;
  const dy = platform.position.y - target.position.y;
  const distance = Math.hypot(dx, dy);
  const awayX = distance > 0 ? dx / distance : lateralSign;
  const awayY = distance > 0 ? dy / distance : 0;
  const lateralX = -awayY * lateralSign;
  const lateralY = awayX * lateralSign;
  const offsetDistance = Math.max(28, desiredRange * 0.35);
  const anchorPoint = {
    x:
      target.position.x +
      awayX * desiredRange +
      lateralX * offsetDistance,
    y:
      target.position.y +
      awayY * desiredRange +
      lateralY * offsetDistance,
  };

  return movePlatformTowards(
    platform,
    anchorPoint,
    Math.max(6, desiredRange * 0.18),
    getPlatformTransitSpeed(platform),
    deltaSeconds,
    bounds,
  );
}

function getCombatLateralSign(platform: MobilePlatform): number {
  const seed = Array.from(platform.id).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return seed % 2 === 0 ? 1 : -1;
}

function getReusableLeadTarget(
  platform: MobilePlatform,
  target: MobilePlatform,
  maxLeadSeconds: number,
): Vector {
  return (
    predictLeadIntercept(platform, target, {
      speedOverride: getPlatformTransitSpeed(platform),
      maxLeadSeconds,
    })?.point ?? target.position
  );
}

export function maneuverAgainstTarget(
  platform: MobilePlatform,
  target: MobilePlatform,
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform {
  const targetType: TargetType = getPlatformTargetType(target);
  const desiredRange = getPreferredCombatRange(platform, targetType);
  const currentDistance = distanceBetween(platform.position, target.position);
  const combatSpeed =
    platform.combatPhase === "attackRun"
      ? platform.maxSpeed
      : Math.min(platform.maxSpeed, getPlatformTransitSpeed(platform) * 0.94);
  const lateralSign = getCombatLateralSign(platform);

  if (platform.oneWay) {
    const payloadWeapon =
      getPrimaryPayloadWeapon(platform, targetType) ??
      getPrimaryPayloadWeapon(platform);
    const blastRadius = payloadWeapon ? getWeaponBlastRadius(payloadWeapon) : 0;
    const payloadRange = payloadWeapon?.maxRange ?? minimumDistanceToTarget;
    const terminalDistance = Math.max(
      oneWayTerminalHomingDistance,
      payloadRange + blastRadius * 1.4,
    );
    const leadPrediction = predictLeadIntercept(platform, target, {
      speedOverride: platform.maxSpeed,
      maxLeadSeconds: oneWayLeadHorizonSeconds,
    });
    const inTerminalHomingWindow = currentDistance <= terminalDistance;

    return movePlatformTowards(
      {
        ...platform,
        status: inTerminalHomingWindow ? "engaging" : "intercepting",
        combatPhase: "attackRun",
        disengageReason: undefined,
      },
      inTerminalHomingWindow ? target.position : leadPrediction?.point ?? target.position,
      inTerminalHomingWindow ? 0 : Math.max(0, blastRadius * 0.18),
      platform.maxSpeed,
      deltaSeconds,
      bounds,
    );
  }

  if (platform.combatPhase === "disengaging") {
    return moveAwayFromTarget(
      { ...platform, status: "returning" },
      target.position,
      desiredRange * 2.4,
      deltaSeconds,
      bounds,
    );
  }

  if (platform.combatPhase === "evading") {
    if (platform.combatPhaseTimeSeconds <= 0.35) {
      const escapeAttempt = moveAwayFromTarget(
        { ...platform, status: "engaging" },
        target.position,
        desiredRange * 1.85,
        deltaSeconds,
        bounds,
      );
      if (getPlatformSpeed(escapeAttempt) > 0.5) {
        return escapeAttempt;
      }

      return moveToCombatOffset(
        { ...platform, status: "engaging", combatPhase: "repositioning" },
        target,
        desiredRange * 1.38,
        -lateralSign,
        deltaSeconds,
        bounds,
      );
    }

    return moveToCombatOffset(
      { ...platform, status: "engaging" },
      target,
      desiredRange * 1.5,
      lateralSign,
      deltaSeconds,
      bounds,
    );
  }

  if (platform.combatPhase === "repositioning") {
    if (platform.combatPhaseTimeSeconds <= 0.55) {
      const extensionAttempt = moveAwayFromTarget(
        { ...platform, status: "engaging" },
        target.position,
        desiredRange * 1.7,
        deltaSeconds,
        bounds,
      );
      if (getPlatformSpeed(extensionAttempt) > 0.5) {
        return extensionAttempt;
      }

      return moveToCombatOffset(
        { ...platform, status: "engaging" },
        target,
        desiredRange * 1.18,
        -lateralSign,
        deltaSeconds,
        bounds,
      );
    }

    return moveToCombatOffset(
      { ...platform, status: "engaging" },
      target,
      desiredRange * 1.28,
      -lateralSign,
      deltaSeconds,
      bounds,
    );
  }

  if (platform.combatPhase === "attackRun") {
    const attackLeadTarget = getReusableLeadTarget(platform, target, 0.95);

    return movePlatformTowards(
      { ...platform, status: "engaging" },
      attackLeadTarget,
      Math.max(8, desiredRange * 0.42),
      combatSpeed,
      deltaSeconds,
      bounds,
    );
  }

  if (currentDistance > desiredRange * 1.18) {
    const pursuitLeadTarget = getReusableLeadTarget(platform, target, 1.2);

    return movePlatformTowards(
      { ...platform, status: "intercepting" },
      pursuitLeadTarget,
      Math.max(10, desiredRange * 0.78),
      combatSpeed,
      deltaSeconds,
      bounds,
    );
  }

  if (currentDistance < desiredRange * 0.55) {
    return moveAwayFromTarget(
      { ...platform, status: "engaging" },
      target.position,
      desiredRange,
      deltaSeconds,
      bounds,
    );
  }

  return moveToCombatOffset(
    { ...platform, status: "engaging" },
    target,
    desiredRange,
    lateralSign,
    deltaSeconds,
    bounds,
  );
}

export function transitionCombatPhase(
  platform: MobilePlatform,
  combatPhase: CombatPhase | undefined,
  options?: {
    engagedWithId?: string;
    disengageReason?: string;
    preserveTimer?: boolean;
  },
): MobilePlatform {
  const phaseChanged = platform.combatPhase !== combatPhase;

  return {
    ...platform,
    engagedWithId: options?.engagedWithId ?? platform.engagedWithId,
    combatPhase,
    combatPhaseTimeSeconds:
      combatPhase && (options?.preserveTimer || !phaseChanged)
        ? platform.combatPhaseTimeSeconds
        : 0,
    disengageReason: options?.disengageReason,
  };
}
