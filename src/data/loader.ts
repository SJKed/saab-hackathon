import mapJson from "../../assets/map.json";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  Resource,
  ResourceType,
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

type ResourcePlan = {
  type: ResourceType;
  label: string;
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
  resources: Resource[];
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

const resourcePlans: ResourcePlan[] = [
  { type: "air-defense", label: "Air Defense" },
  { type: "drone", label: "Drone Wing" },
  { type: "robot", label: "Ground Robot Unit" },
];

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
    attack: 42,
    defense: 56,
    health: 260,
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
    attack: 34,
    defense: 48,
    health: 210,
  };
}

function getResourceSpeed(type: ResourceType): number {
  return type === "drone" ? 3 : type === "air-defense" ? 2 : 1.5;
}

function getResourceRange(type: ResourceType): number {
  return type === "air-defense" ? 220 : type === "drone" ? 150 : 120;
}

function createResourceFromSpawnZone(
  spawnZone: AlliedSpawnZone,
  index: number,
): Resource {
  const plan = resourcePlans[index % resourcePlans.length];
  const attack =
    plan.type === "air-defense" ? 52 : plan.type === "drone" ? 38 : 44;
  const defense =
    plan.type === "air-defense" ? 46 : plan.type === "drone" ? 28 : 40;
  const health =
    plan.type === "air-defense" ? 125 : plan.type === "drone" ? 78 : 112;

  return {
    id: `R${index + 1}`,
    name: `${spawnZone.name ?? spawnZone.id} ${plan.label}`,
    type: plan.type,
    position: { ...spawnZone.position },
    velocity: { x: 0, y: 0 },
    speed: getResourceSpeed(plan.type),
    range: getResourceRange(plan.type),
    cooldown: 0,
    available: true,
    originSpawnZoneId: spawnZone.id,
    attack,
    defense,
    health,
  };
}

function normalizeSpawnZone(
  spawn: RawPoint,
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): EnemyBase {
  return {
    id: spawn.id,
    name: spawn.name,
    position: normalizeVector(spawn, sourceSize, canvasSize),
    attack: 39,
    defense: 52,
    health: 240,
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

  return {
    alliedCities: validatedMap.alliedCities.map((city) =>
      normalizeAlliedCity(city, sourceSize, canvasSize),
    ),
    alliedSpawnZones: validatedMap.alliedSpawnZones.map((spawnZone) =>
      normalizeAlliedSpawnZone(spawnZone, sourceSize, canvasSize),
    ),
    resources: validatedMap.alliedSpawnZones
      .map((spawnZone) => normalizeAlliedSpawnZone(spawnZone, sourceSize, canvasSize))
      .map(createResourceFromSpawnZone),
    enemyBases: validatedMap.enemySpawnZones.map((spawn) =>
      normalizeSpawnZone(spawn, sourceSize, canvasSize),
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
