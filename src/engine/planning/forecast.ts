import type { AlliedCity, MobilePlatform } from "../../models/entity";
import { distanceKm } from "../../models/distance";
import { distanceBetween } from "../../models/platform-utils";
import type { EnemyIntentBelief } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTimeToCity(
  enemyPlatform: MobilePlatform,
  city: AlliedCity,
): number {
  const speed = Math.hypot(enemyPlatform.velocity.x, enemyPlatform.velocity.y);
  if (speed <= 0.001) {
    return Number.POSITIVE_INFINITY;
  }

  return distanceBetween(enemyPlatform.position, city.position) / speed;
}

export function estimateEnemyExpectedDamage(
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
  belief: EnemyIntentBelief | undefined,
): number {
  const city = cities.find((candidate) => candidate.id === belief?.mostLikelyCityId);
  const targetValue = city?.value ?? 5;
  const timeToCity = city ? getTimeToCity(enemyPlatform, city) : Number.POSITIVE_INFINITY;
  const urgencyMultiplier = Number.isFinite(timeToCity)
    ? clamp(1.45 + 8 / Math.max(4, timeToCity), 1, 3.15)
    : 1.1;
  const classMultiplier =
    enemyPlatform.platformClass === "ballisticMissile"
      ? 1.55
      : enemyPlatform.platformClass === "fighterJet"
        ? 1.18
        : 0.92;

  return (
    enemyPlatform.threatLevel *
    targetValue *
    classMultiplier *
    urgencyMultiplier *
    (belief?.confidence ?? 0.5)
  );
}

export function estimateCityResidualRisk(
  city: AlliedCity,
  enemyPlatforms: MobilePlatform[],
  beliefs: EnemyIntentBelief[],
): number {
  return enemyPlatforms.reduce((total, enemyPlatform) => {
    const belief = beliefs.find((entry) => entry.enemyId === enemyPlatform.id);
    const probability =
      belief?.cityProbabilities.find((entry) => entry.cityId === city.id)?.probability ?? 0;
    const distanceFactor =
      1 / (1 + distanceKm(enemyPlatform.position, city.position) / 260);

    return total + enemyPlatform.threatLevel * probability * (0.8 + distanceFactor * 1.2);
  }, city.threat * 50);
}
