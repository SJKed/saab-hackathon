import type {
  AlliedCity,
  MobilePlatform,
  Vector,
} from "../../models/entity";
import { distanceBetween } from "../../models/platform-utils";
import type { ResourceAssignment } from "../../engine/allocation";
import { predictIntercept } from "../../engine/intercept";

export function getTargetCity(
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

export function getAssignmentTarget(
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

    return (
      predictIntercept(platform, enemyPlatform, cities)?.point ??
      enemyPlatform.position
    );
  }

  return cities.find((city) => city.id === assignment.targetId)?.position;
}

export function getLockedBallisticMissileTarget(
  platform: MobilePlatform,
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): Vector | undefined {
  if (
    platform.platformClass !== "ballisticMissile" ||
    !platform.targetId
  ) {
    return undefined;
  }

  const enemyPlatform = enemyPlatforms.find(
    (enemy) => enemy.id === platform.targetId,
  );
  if (enemyPlatform) {
    return enemyPlatform.position;
  }

  return cities.find((city) => city.id === platform.targetId)?.position;
}
