import type { AlliedCity, MobilePlatform, Vector } from "../models/entity";
import {
  distanceBetween,
  getPlatformTargetType,
  platformCanSenseTarget,
} from "../models/platform-utils";

export type InterceptPrediction = {
  point: Vector;
  distance: number;
  timeToIntercept: number;
  enemyTimeToCity: number;
  feasibleBeforeImpact: boolean;
  acquisitionFeasible: boolean;
};

const minimumCityImpactDistance = 8;
const interceptLeadBufferSeconds = 0.45;
const epsilon = 0.000001;

function getTargetCity(
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
): AlliedCity | undefined {
  if (enemyPlatform.targetId) {
    const matchedCity = cities.find((city) => city.id === enemyPlatform.targetId);
    if (matchedCity) {
      return matchedCity;
    }
  }

  let nearestCity: AlliedCity | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const distance = distanceBetween(enemyPlatform.position, city.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCity = city;
    }
  }

  return nearestCity;
}

export function getPlatformTransitSpeed(platform: MobilePlatform): number {
  const maneuverBonus =
    platform.acceleration * 0.08 + platform.turnRate * 10;

  return Math.min(platform.maxSpeed, platform.cruiseSpeed + maneuverBonus);
}

export function getSensorEnvelope(
  platform: MobilePlatform,
  target: MobilePlatform,
): number {
  const targetSignatureModifier = 0.82 + target.combat.signature * 0.42;
  const trackingModifier = 0.9 + platform.sensors.trackingQuality * 0.28;

  return (
    platform.sensors.sensorRange *
    targetSignatureModifier *
    trackingModifier
  );
}

function getEnemyTimeToCity(
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
): number {
  const targetCity = getTargetCity(enemyPlatform, cities);
  if (!targetCity) {
    return Number.POSITIVE_INFINITY;
  }

  const remainingDistance = Math.max(
    0,
    distanceBetween(enemyPlatform.position, targetCity.position) -
      minimumCityImpactDistance,
  );

  if (remainingDistance <= 0) {
    return 0;
  }

  const enemySpeed = Math.hypot(
    enemyPlatform.velocity.x,
    enemyPlatform.velocity.y,
  );
  if (enemySpeed <= epsilon) {
    return Number.POSITIVE_INFINITY;
  }

  return remainingDistance / enemySpeed;
}

function getManeuverDelaySeconds(platform: MobilePlatform): number {
  const turnPenalty = Math.max(0, 0.9 - platform.turnRate) * 0.65;
  const accelerationPenalty =
    Math.max(0, 70 - platform.acceleration) / 85;

  return 0.18 + turnPenalty + accelerationPenalty;
}

function solveInterceptTime(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
  alliedSpeed: number,
): number | undefined {
  const relativeX = enemyPlatform.position.x - alliedPlatform.position.x;
  const relativeY = enemyPlatform.position.y - alliedPlatform.position.y;
  const enemyVelocitySquared =
    enemyPlatform.velocity.x * enemyPlatform.velocity.x +
    enemyPlatform.velocity.y * enemyPlatform.velocity.y;
  const alliedSpeedSquared = alliedSpeed * alliedSpeed;
  const a = enemyVelocitySquared - alliedSpeedSquared;
  const b =
    2 *
    (relativeX * enemyPlatform.velocity.x + relativeY * enemyPlatform.velocity.y);
  const c = relativeX * relativeX + relativeY * relativeY;

  if (Math.abs(a) <= epsilon) {
    if (Math.abs(b) <= epsilon) {
      return c <= epsilon ? 0 : undefined;
    }

    const linearTime = -c / b;
    return linearTime >= 0 ? linearTime : undefined;
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return undefined;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const first = (-b - sqrtDiscriminant) / (2 * a);
  const second = (-b + sqrtDiscriminant) / (2 * a);
  const positiveTimes = [first, second].filter((time) => time >= 0);

  if (positiveTimes.length === 0) {
    return undefined;
  }

  return Math.min(...positiveTimes);
}

export function predictIntercept(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
): InterceptPrediction | undefined {
  const alliedSpeed = getPlatformTransitSpeed(alliedPlatform);
  if (alliedSpeed <= epsilon) {
    return undefined;
  }

  const directDistance = distanceBetween(
    alliedPlatform.position,
    enemyPlatform.position,
  );
  const enemyTimeToCity = getEnemyTimeToCity(enemyPlatform, cities);
  const rawInterceptTime = solveInterceptTime(
    alliedPlatform,
    enemyPlatform,
    alliedSpeed,
  );
  const maneuverDelay = getManeuverDelaySeconds(alliedPlatform);
  const targetType = getPlatformTargetType(enemyPlatform);
  const acquisitionFeasible =
    platformCanSenseTarget(alliedPlatform, targetType) &&
    directDistance <= getSensorEnvelope(alliedPlatform, enemyPlatform) * 1.18;

  if (rawInterceptTime === undefined) {
    const fallbackTime = Number.isFinite(enemyTimeToCity)
      ? Math.max(0, enemyTimeToCity - interceptLeadBufferSeconds)
      : 0;
    const fallbackPoint = {
      x: enemyPlatform.position.x + enemyPlatform.velocity.x * fallbackTime,
      y: enemyPlatform.position.y + enemyPlatform.velocity.y * fallbackTime,
    };
    const fallbackDistance = distanceBetween(
      alliedPlatform.position,
      fallbackPoint,
    );

    return {
      point: fallbackPoint,
      distance: fallbackDistance,
      timeToIntercept: fallbackDistance / alliedSpeed + maneuverDelay,
      enemyTimeToCity,
      feasibleBeforeImpact: false,
      acquisitionFeasible,
    };
  }

  const interceptTime = rawInterceptTime + maneuverDelay;
  const point = {
    x: enemyPlatform.position.x + enemyPlatform.velocity.x * interceptTime,
    y: enemyPlatform.position.y + enemyPlatform.velocity.y * interceptTime,
  };
  const distance = distanceBetween(alliedPlatform.position, point);
  const latestSafeInterceptTime = Number.isFinite(enemyTimeToCity)
    ? Math.max(0, enemyTimeToCity - interceptLeadBufferSeconds)
    : Number.POSITIVE_INFINITY;

  return {
    point,
    distance: directDistance > epsilon ? distance : 0,
    timeToIntercept: interceptTime,
    enemyTimeToCity,
    feasibleBeforeImpact:
      acquisitionFeasible && interceptTime <= latestSafeInterceptTime,
    acquisitionFeasible,
  };
}
