import type {
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  Vector,
} from "./entity";
import {
  distanceBetween,
  isPlatformDestroyed,
  isPlatformStored,
} from "./platform-utils";

const minimumFuelReserveSeconds = 4;
const maximumFuelReserveSeconds = 12;
const fuelReserveFraction = 0.08;
export const recoveryArrivalDistance = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRecoverySites(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): Array<{ originId: string; position: Vector }> {
  return platform.team === "allied"
    ? alliedSpawnZones.map((zone) => ({
        originId: zone.id,
        position: zone.position,
      }))
    : enemyBases.map((base) => ({
        originId: base.id,
        position: base.position,
      }));
}

export function getClosestRecoveryBase(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): { originId: string; position: Vector } | undefined {
  const recoverySites = getRecoverySites(platform, alliedSpawnZones, enemyBases);
  let closestSite: { originId: string; position: Vector } | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const site of recoverySites) {
    const distance = distanceBetween(platform.position, site.position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestSite = site;
    }
  }

  return closestSite;
}

export function getFuelReserveSeconds(platform: MobilePlatform): number {
  return clamp(
    platform.maxEnduranceSeconds * fuelReserveFraction,
    minimumFuelReserveSeconds,
    maximumFuelReserveSeconds,
  );
}

export function estimateRecoveryTravelTimeSeconds(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): number | undefined {
  const closestBase = getClosestRecoveryBase(platform, alliedSpawnZones, enemyBases);
  if (!closestBase) {
    return undefined;
  }

  const remainingDistance = Math.max(
    0,
    distanceBetween(platform.position, closestBase.position) - recoveryArrivalDistance,
  );
  const returnSpeed = Math.max(1, platform.cruiseSpeed);

  return remainingDistance / returnSpeed;
}

export function getFuelRequiredToRecover(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): number | undefined {
  const recoveryTravelTime = estimateRecoveryTravelTimeSeconds(
    platform,
    alliedSpawnZones,
    enemyBases,
  );
  if (recoveryTravelTime === undefined) {
    return undefined;
  }

  return recoveryTravelTime + getFuelReserveSeconds(platform);
}

export function getFuelMarginForRecovery(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): number {
  const requiredFuel = getFuelRequiredToRecover(
    platform,
    alliedSpawnZones,
    enemyBases,
  );
  if (requiredFuel === undefined) {
    return isPlatformStored(platform)
      ? platform.enduranceSeconds
      : Number.NEGATIVE_INFINITY;
  }

  return platform.enduranceSeconds - requiredFuel;
}

export function getMissionFuelBudgetSeconds(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): number {
  if (isPlatformDestroyed(platform)) {
    return 0;
  }

  if (platform.oneWay) {
    return Math.max(0, platform.enduranceSeconds);
  }

  return Math.max(
    0,
    getFuelMarginForRecovery(platform, alliedSpawnZones, enemyBases),
  );
}

export function hasReachedLatestSafeRecallMoment(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): boolean {
  return (
    !platform.oneWay &&
    !isPlatformStored(platform) &&
    !isPlatformDestroyed(platform) &&
    getMissionFuelBudgetSeconds(platform, alliedSpawnZones, enemyBases) <= 0
  );
}
