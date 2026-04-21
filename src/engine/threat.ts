import type { AlliedCity, Enemy } from "../models/entity";

const minimumDistance = 1;

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function calculateCityThreat(city: AlliedCity, enemies: Enemy[]): number {
  return enemies.reduce((totalThreat, enemy) => {
    const distance = Math.max(
      minimumDistance,
      distanceBetween(enemy.position, city.position),
    );

    return totalThreat + enemy.threatLevel / distance;
  }, 0);
}

export function calculateThreatsForCities(
  cities: AlliedCity[],
  enemies: Enemy[],
): AlliedCity[] {
  return cities.map((city) => ({
    ...city,
    threat: calculateCityThreat(city, enemies),
  }));
}
