import type { AlliedCity, MobilePlatform } from "../models/entity";
import {
  SCALE,
  distanceWorld,
  pixelToWorldDistance,
} from "../models/distance";
import { isPlatformDeployed } from "../models/platform-utils";

const minimumDistance = pixelToWorldDistance(1);
const minimumSpeedForEta = pixelToWorldDistance(0.08);

function getIntentWeight(enemyPlatform: MobilePlatform, city: AlliedCity): number {
  if (enemyPlatform.targetId === city.id) {
    return 1.45;
  }
  if (enemyPlatform.targetId) {
    return 0.75;
  }
  return 1;
}

function getTimePressureWeight(enemyPlatform: MobilePlatform, city: AlliedCity): number {
  const distance = distanceWorld(enemyPlatform.position, city.position);
  const speed = Math.max(
    minimumSpeedForEta,
    Math.hypot(enemyPlatform.velocity.x, enemyPlatform.velocity.y),
  );
  const etaSeconds = distance / speed;

  if (etaSeconds <= 12) {
    return 1.35;
  }
  if (etaSeconds <= 24) {
    return 1.16;
  }
  if (etaSeconds <= 40) {
    return 1.05;
  }
  return 0.92;
}

export function calculateCityThreat(
  city: AlliedCity,
  enemyPlatforms: MobilePlatform[],
): number {
  return enemyPlatforms.reduce((totalThreat, enemyPlatform) => {
    if (!isPlatformDeployed(enemyPlatform)) {
      return totalThreat;
    }

    const distance = Math.max(
      minimumDistance,
      distanceWorld(enemyPlatform.position, city.position),
    );
    const strikeWeight =
      enemyPlatform.platformClass === "ballisticMissile" ? 1.35 : 1;
    const intentWeight = getIntentWeight(enemyPlatform, city);
    const timePressureWeight = getTimePressureWeight(enemyPlatform, city);

    return (
      totalThreat +
      ((enemyPlatform.threatLevel *
        strikeWeight *
        intentWeight *
        timePressureWeight) /
        distance) *
        SCALE
    );
  }, 0);
}

export function calculateThreatsForCities(cities: AlliedCity[], enemyPlatforms: MobilePlatform[]): AlliedCity[] {
  return cities.map((city) => ({
    ...city,
    threat: calculateCityThreat(city, enemyPlatforms),
  }));
}
