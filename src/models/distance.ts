import type { Vector } from "./entity";

export const mapWidthKm = 1000;
export const rawMapWidthUnits = 1666.7;
export const simulationTimeCompression = 180;

const rawUnitsPerKm = rawMapWidthUnits / mapWidthKm;

export function rawToKm(rawUnits: number): number {
  return rawUnits / rawUnitsPerKm;
}

export function kmToRaw(kilometers: number): number {
  return kilometers * rawUnitsPerKm;
}

export function distanceRaw(a: Vector, b: Vector): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceKm(a: Vector, b: Vector): number {
  return rawToKm(distanceRaw(a, b));
}

export function kmPerHourToRawUnitsPerSecond(kilometersPerHour: number): number {
  const compressedKilometersPerSecond =
    (kilometersPerHour / 3600) * simulationTimeCompression;

  return kmToRaw(compressedKilometersPerSecond);
}
