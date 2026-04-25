import type { AlliedCity, MobilePlatform } from "../models/entity";
import {
  SCALE,
  distanceWorld,
  pixelToWorldDistance,
} from "../models/distance";
import { isPlatformDeployed } from "../models/platform-utils";

const minimumDistance = pixelToWorldDistance(1);

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

    return (
      totalThreat +
      ((enemyPlatform.threatLevel * strikeWeight) / distance) * SCALE
    );
  }, 0);
}

export function calculateThreatsForCities(cities: AlliedCity[], enemyPlatforms: MobilePlatform[]): AlliedCity[] {
  return cities.map((city) => ({
    ...city,
    threat: calculateCityThreat(city, enemyPlatforms),
  }));
}
