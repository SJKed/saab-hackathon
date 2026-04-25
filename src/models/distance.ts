import type { Vector } from "./entity";

export const SCALE = 200;
export const simulationTimeCompression = 60000;
const distanceDebugLogLimit = 20;
let distanceDebugLogCount = 0;

export function rawToKm(rawUnits: number): number {
  return pixelToWorldDistance(rawUnits);
}

export function kmToRaw(kilometers: number): number {
  return worldToPixelDistance(kilometers);
}

export function distanceRaw(a: Vector, b: Vector): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pixelToWorldDistance(distance: number): number {
  const worldDistance = distance * SCALE;
  if (distanceDebugLogCount < distanceDebugLogLimit) {
    console.log("World distance:", worldDistance);
    distanceDebugLogCount += 1;
  }

  return worldDistance;
}

export function worldToPixelDistance(distance: number): number {
  return distance / SCALE;
}

export function distanceWorld(a: Vector, b: Vector): number {
  return pixelToWorldDistance(distanceRaw(a, b));
}

export function pixelRateToWorldRate(rate: number): number {
  return pixelToWorldDistance(rate);
}

export function distanceKm(a: Vector, b: Vector): number {
  return rawToKm(distanceRaw(a, b));
}

export function kmPerHourToRawUnitsPerSecond(kilometersPerHour: number): number {
  const compressedWorldUnitsPerSecond =
    (kilometersPerHour / 3600) * simulationTimeCompression;

  return worldToPixelDistance(compressedWorldUnitsPerSecond);
}
