import mapJson from "../../assets/map.json";
import { createAlliedPlatforms } from "./platform-factories";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  Vector,
} from "../models/entity";

type RawPoint = {
  id: string;
  name?: string;
  x: number;
  y: number;
};

type RawAlliedCity = RawPoint & {
  value: number;
};

type RawTerrainZone = {
  id?: string;
  name?: string;
  side?: string;
  subtype?: string;
  points: [number, number][];
};

type RawTerrain = {
  waterZones: RawTerrainZone[];
  landZones: RawTerrainZone[];
};

type RawMapData = {
  meta: {
    width: number;
    height: number;
  };
  alliedCities: RawAlliedCity[];
  alliedSpawnZones: RawPoint[];
  enemySpawnZones: RawPoint[];
  terrain: RawTerrain;
};

export type NormalizedMapData = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  alliedPlatforms: MobilePlatform[];
  enemyBases: EnemyBase[];
  terrain: NormalizedTerrain;
};

export type NormalizedTerrainZone = {
  id?: string;
  name?: string;
  side?: string;
  subtype?: string;
  points: Vector[];
};

export type NormalizedTerrain = {
  waterZones: NormalizedTerrainZone[];
  landZones: NormalizedTerrainZone[];
};

type CanvasSize = {
  width: number;
  height: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRawPoint(value: unknown): value is RawPoint {
  if (!isRecord(value)) {
    return false;
  }

  if ("name" in value && typeof value.name !== "string") {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

function isRawAlliedCity(value: unknown): value is RawAlliedCity {
  if (!isRawPoint(value)) {
    return false;
  }

  return isFiniteNumber((value as Record<string, unknown>).value);
}

function isRawTerrainPoint(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function isRawTerrainZone(value: unknown): value is RawTerrainZone {
  if (!isRecord(value)) {
    return false;
  }

  if ("id" in value && typeof value.id !== "string") {
    return false;
  }

  if ("name" in value && typeof value.name !== "string") {
    return false;
  }

  if ("side" in value && typeof value.side !== "string") {
    return false;
  }

  if ("subtype" in value && typeof value.subtype !== "string") {
    return false;
  }

  if (!Array.isArray(value.points)) {
    return false;
  }

  return value.points.every(isRawTerrainPoint);
}

function isRawTerrain(value: unknown): value is RawTerrain {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.waterZones) &&
    value.waterZones.every(isRawTerrainZone) &&
    Array.isArray(value.landZones) &&
    value.landZones.every(isRawTerrainZone)
  );
}

export function validateMapData(value: unknown): value is RawMapData {
  if (!isRecord(value)) {
    return false;
  }

  const { meta, alliedCities, alliedSpawnZones, enemySpawnZones, terrain } = value;

  if (!isRecord(meta)) {
    return false;
  }

  if (!isFiniteNumber(meta.width) || !isFiniteNumber(meta.height)) {
    return false;
  }

  if (meta.width <= 0 || meta.height <= 0) {
    return false;
  }

  if (!Array.isArray(alliedCities) || !alliedCities.every(isRawAlliedCity)) {
    return false;
  }

  if (!Array.isArray(alliedSpawnZones) || !alliedSpawnZones.every(isRawPoint)) {
    return false;
  }

  if (!Array.isArray(enemySpawnZones) || !enemySpawnZones.every(isRawPoint)) {
    return false;
  }

  if (!isRawTerrain(terrain)) {
    return false;
  }

  return true;
}

function normalizeCoordinate(rawValue: number, rawMax: number, canvasMax: number): number {
  if (rawMax <= 0 || canvasMax <= 0) {
    throw new Error("Normalization bounds must be greater than zero.");
  }

  return (rawValue / rawMax) * canvasMax;
}

export function normalizeVector(
  raw: { x: number; y: number },
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): Vector {
  return {
    x: normalizeCoordinate(raw.x, sourceSize.width, canvasSize.width),
    y: normalizeCoordinate(raw.y, sourceSize.height, canvasSize.height),
  };
}

function normalizeAlliedCity(
  city: RawAlliedCity,
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): AlliedCity {
  return {
    id: city.id,
    name: city.name,
    position: normalizeVector(city, sourceSize, canvasSize),
    value: city.value,
    threat: 0,
    maxHealth: 260,
    health: 260,
    defenseRating: 0.22,
  };
}

function normalizeAlliedSpawnZone(
  spawnZone: RawPoint,
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): AlliedSpawnZone {
  return {
    id: spawnZone.id,
    name: spawnZone.name,
    position: normalizeVector(spawnZone, sourceSize, canvasSize),
    maxHealth: 210,
    health: 210,
    defenseRating: 0.16,
  };
}

function normalizeEnemyBase(
  spawn: RawPoint,
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): EnemyBase {
  return {
    id: spawn.id,
    name: spawn.name,
    position: normalizeVector(spawn, sourceSize, canvasSize),
    maxHealth: 240,
    health: 240,
    defenseRating: 0.18,
  };
}

function normalizeTerrainZone(
  zone: RawTerrainZone,
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): NormalizedTerrainZone {
  return {
    id: zone.id,
    name: zone.name,
    side: zone.side,
    subtype: zone.subtype,
    points: zone.points.map(([x, y]) =>
      normalizeVector({ x, y }, sourceSize, canvasSize),
    ),
  };
}

export function loadMapData(canvasSize: CanvasSize): NormalizedMapData {
  if (!validateMapData(mapJson)) {
    throw new Error("Invalid map.json structure.");
  }

  const validatedMap: RawMapData = mapJson;
  const sourceSize = {
    width: validatedMap.meta.width,
    height: validatedMap.meta.height,
  };

  const alliedCities = validatedMap.alliedCities.map((city) =>
    normalizeAlliedCity(city, sourceSize, canvasSize),
  );
  const alliedSpawnZones = validatedMap.alliedSpawnZones.map((spawnZone) =>
    normalizeAlliedSpawnZone(spawnZone, sourceSize, canvasSize),
  );

  return {
    alliedCities,
    alliedSpawnZones,
    alliedPlatforms: createAlliedPlatforms(alliedSpawnZones),
    enemyBases: validatedMap.enemySpawnZones.map((spawn) =>
      normalizeEnemyBase(spawn, sourceSize, canvasSize),
    ),
    terrain: {
      waterZones: validatedMap.terrain.waterZones.map((zone) =>
        normalizeTerrainZone(zone, sourceSize, canvasSize),
      ),
      landZones: validatedMap.terrain.landZones.map((zone) =>
        normalizeTerrainZone(zone, sourceSize, canvasSize),
      ),
    },
  };
}
