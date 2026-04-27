import type {
  AlliedCity,
  MobilePlatform,
  Vector,
} from "../../models/entity";
import {
  distanceWorld,
  kmToRaw,
  pixelRateToWorldRate,
  pixelToWorldDistance,
  rawToKm,
} from "../../models/distance";
import {
  distanceBetween,
  getPlatformTargetType,
  platformCanSenseTarget,
} from "../../models/platform-utils";
import { getSensorEnvelope } from "./sensors";
import { getPlatformTransitSpeed } from "./transit";

export type InterceptPrediction = {
  point: Vector;
  distance: number;
  timeToIntercept: number;
  enemyTimeToCity: number;
  feasibleBeforeImpact: boolean;
  acquisitionFeasible: boolean;
};

export type LeadInterceptPrediction = {
  point: Vector;
  distance: number;
  timeToIntercept: number;
};

const minimumCityImpactDistance = kmToRaw(2.4);
const interceptLeadBufferSeconds = 0.45;
const epsilon = 0.000001;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
    pixelToWorldDistance(
      distanceBetween(enemyPlatform.position, targetCity.position) -
        minimumCityImpactDistance,
    ),
  );

  if (remainingDistance <= 0) {
    return 0;
  }

  const enemySpeed = pixelRateToWorldRate(
    Math.hypot(enemyPlatform.velocity.x, enemyPlatform.velocity.y),
  );
  if (enemySpeed <= epsilon) {
    return Number.POSITIVE_INFINITY;
  }

  return remainingDistance / enemySpeed;
}

function getManeuverDelaySeconds(platform: MobilePlatform): number {
  const accelerationPenalty = Math.max(0, 420 - platform.acceleration) / 520;

  return 0.18 + accelerationPenalty;
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
    (relativeX * enemyPlatform.velocity.x +
      relativeY * enemyPlatform.velocity.y);
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

export function predictLeadIntercept(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
  options?: {
    speedOverride?: number;
    maxLeadSeconds?: number;
  },
): LeadInterceptPrediction | undefined {
  const alliedSpeedRaw =
    options?.speedOverride ?? getPlatformTransitSpeed(alliedPlatform);
  const alliedSpeed = pixelRateToWorldRate(alliedSpeedRaw);
  if (alliedSpeed <= epsilon) {
    return undefined;
  }

  const directDistance = distanceWorld(
    alliedPlatform.position,
    enemyPlatform.position,
  );
  const maneuverDelay = getManeuverDelaySeconds(alliedPlatform);
  const fallbackProjectionTime = clamp(
    directDistance / alliedSpeed,
    0.15,
    options?.maxLeadSeconds ?? 1.6,
  );
  const rawInterceptTime =
    solveInterceptTime(alliedPlatform, enemyPlatform, alliedSpeedRaw) ??
    Math.max(0, fallbackProjectionTime - maneuverDelay);
  const timeToIntercept = clamp(
    rawInterceptTime + maneuverDelay,
    0,
    options?.maxLeadSeconds ?? Number.POSITIVE_INFINITY,
  );
  const point = {
    x: enemyPlatform.position.x + enemyPlatform.velocity.x * timeToIntercept,
    y: enemyPlatform.position.y + enemyPlatform.velocity.y * timeToIntercept,
  };

  return {
    point,
    distance: distanceWorld(alliedPlatform.position, point),
    timeToIntercept,
  };
}

export function predictIntercept(
  alliedPlatform: MobilePlatform,
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
): InterceptPrediction | undefined {
  const directDistanceRaw = distanceBetween(
    alliedPlatform.position,
    enemyPlatform.position,
  );
  const directDistanceKm = rawToKm(directDistanceRaw);
  const enemyTimeToCity = getEnemyTimeToCity(enemyPlatform, cities);
  const targetType = getPlatformTargetType(enemyPlatform);
  const acquisitionFeasible =
    platformCanSenseTarget(alliedPlatform, targetType) &&
    directDistanceKm <= getSensorEnvelope(alliedPlatform, enemyPlatform) * 1.18;
  const leadPrediction = predictLeadIntercept(alliedPlatform, enemyPlatform);

  if (!leadPrediction) {
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
      distance: pixelToWorldDistance(fallbackDistance),
      timeToIntercept: Number.POSITIVE_INFINITY,
      enemyTimeToCity,
      feasibleBeforeImpact: false,
      acquisitionFeasible,
    };
  }

  const latestSafeInterceptTime = Number.isFinite(enemyTimeToCity)
    ? Math.max(0, enemyTimeToCity - interceptLeadBufferSeconds)
    : Number.POSITIVE_INFINITY;

  return {
    point: leadPrediction.point,
    distance: directDistanceRaw > epsilon ? leadPrediction.distance : 0,
    timeToIntercept: leadPrediction.timeToIntercept,
    enemyTimeToCity,
    feasibleBeforeImpact:
      acquisitionFeasible &&
      leadPrediction.timeToIntercept <= latestSafeInterceptTime,
    acquisitionFeasible,
  };
}
