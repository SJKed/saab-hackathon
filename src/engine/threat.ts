import type { Base, Enemy } from "../models/entity";

const minimumDistance = 1;

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function calculateBaseThreat(base: Base, enemies: Enemy[]): number {
  return enemies.reduce((totalThreat, enemy) => {
    const distance = Math.max(
      minimumDistance,
      distanceBetween(enemy.position, base.position),
    );

    return totalThreat + enemy.threatLevel / distance;
  }, 0);
}

export function calculateThreatsForBases(bases: Base[], enemies: Enemy[]): Base[] {
  return bases.map((base) => ({
    ...base,
    threat: calculateBaseThreat(base, enemies),
  }));
}
