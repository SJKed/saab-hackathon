import type { AlliedCity, Enemy, Resource, Vector } from "../models/entity";

export type InterceptPrediction = {
  point: Vector;
  distance: number;
  timeToIntercept: number;
  enemyTimeToCity: number;
  feasibleBeforeImpact: boolean;
};

export const resourceSpeedScale = 42;

const minimumCityImpactDistance = 6;
const interceptLeadBufferSeconds = 0.5;
const epsilon = 0.000001;

function distanceBetween(a: Vector, b: Vector): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getTargetCity(enemy: Enemy, cities: AlliedCity[]): AlliedCity | undefined {
  if (enemy.targetId) {
    const matchedCity = cities.find((city) => city.id === enemy.targetId);
    if (matchedCity) {
      return matchedCity;
    }
  }

  let nearestCity: AlliedCity | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const distance = distanceBetween(enemy.position, city.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCity = city;
    }
  }

  return nearestCity;
}

function getEnemyTimeToCity(enemy: Enemy, cities: AlliedCity[]): number {
  const targetCity = getTargetCity(enemy, cities);
  if (!targetCity) {
    return Number.POSITIVE_INFINITY;
  }

  const remainingDistance = Math.max(
    0,
    distanceBetween(enemy.position, targetCity.position) - minimumCityImpactDistance,
  );

  if (remainingDistance <= 0) {
    return 0;
  }

  const enemySpeed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  if (enemySpeed <= epsilon) {
    return Number.POSITIVE_INFINITY;
  }

  return remainingDistance / enemySpeed;
}

function solveInterceptTime(
  resource: Resource,
  enemy: Enemy,
  resourceSpeed: number,
): number | undefined {
  const relativeX = enemy.position.x - resource.position.x;
  const relativeY = enemy.position.y - resource.position.y;
  const enemyVelocitySquared =
    enemy.velocity.x * enemy.velocity.x + enemy.velocity.y * enemy.velocity.y;
  const resourceSpeedSquared = resourceSpeed * resourceSpeed;
  const a = enemyVelocitySquared - resourceSpeedSquared;
  const b = 2 * (relativeX * enemy.velocity.x + relativeY * enemy.velocity.y);
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

export function getScaledResourceSpeed(resource: Resource): number {
  return resource.speed * resourceSpeedScale;
}

export function predictIntercept(
  resource: Resource,
  enemy: Enemy,
  cities: AlliedCity[],
): InterceptPrediction | undefined {
  const resourceSpeed = getScaledResourceSpeed(resource);
  if (resourceSpeed <= epsilon) {
    return undefined;
  }

  const directDistance = distanceBetween(resource.position, enemy.position);
  const enemyTimeToCity = getEnemyTimeToCity(enemy, cities);
  const interceptTime = solveInterceptTime(resource, enemy, resourceSpeed);

  if (interceptTime === undefined) {
    const fallbackTime = Number.isFinite(enemyTimeToCity)
      ? Math.max(0, enemyTimeToCity - interceptLeadBufferSeconds)
      : 0;
    const fallbackPoint = {
      x: enemy.position.x + enemy.velocity.x * fallbackTime,
      y: enemy.position.y + enemy.velocity.y * fallbackTime,
    };
    const fallbackDistance = distanceBetween(resource.position, fallbackPoint);

    return {
      point: fallbackPoint,
      distance: fallbackDistance,
      timeToIntercept: fallbackDistance / resourceSpeed,
      enemyTimeToCity,
      feasibleBeforeImpact: false,
    };
  }

  const point = {
    x: enemy.position.x + enemy.velocity.x * interceptTime,
    y: enemy.position.y + enemy.velocity.y * interceptTime,
  };
  const distance = distanceBetween(resource.position, point);
  const latestSafeInterceptTime = Number.isFinite(enemyTimeToCity)
    ? Math.max(0, enemyTimeToCity - interceptLeadBufferSeconds)
    : Number.POSITIVE_INFINITY;

  return {
    point,
    distance: directDistance > epsilon ? distance : 0,
    timeToIntercept: interceptTime,
    enemyTimeToCity,
    feasibleBeforeImpact: interceptTime <= latestSafeInterceptTime,
  };
}
