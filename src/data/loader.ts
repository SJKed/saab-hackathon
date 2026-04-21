import mapJson from "../../assets/map.json";
import type { Base, EnemyBase, Resource, ResourceType, Vector } from "../models/entity";

type RawPoint = {
  id: string;
  name?: string;
  x: number;
  y: number;
};

type RawBase = RawPoint & {
  value: number;
};

type RawResource = RawPoint & {
  type: ResourceType;
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
  bases: RawBase[];
  resources: RawResource[];
  enemySpawnZones: RawPoint[];
  terrain: RawTerrain;
};

export type NormalizedMapData = {
  bases: Base[];
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

function isRawBase(value: unknown): value is RawBase {
  if (!isRawPoint(value)) {
    return false;
  }

  return isFiniteNumber((value as Record<string, unknown>).value);
}

function isResourceType(value: unknown): value is ResourceType {
  return value === "drone" || value === "air-defense" || value === "robot";
}

function isRawResource(value: unknown): value is RawResource {
  if (!isRawPoint(value)) {
    return false;
  }

  return isResourceType((value as Record<string, unknown>).type);
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

  const { meta, bases, resources, enemySpawnZones, terrain } = value;

  if (!isRecord(meta)) {
    return false;
  }

  if (!isFiniteNumber(meta.width) || !isFiniteNumber(meta.height)) {
    return false;
  }

  if (meta.width <= 0 || meta.height <= 0) {
    return false;
  }

  if (!Array.isArray(bases) || !bases.every(isRawBase)) {
    return false;
  }

  if (!Array.isArray(resources) || !resources.every(isRawResource)) {
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

function normalizeBase(base: RawBase, sourceSize: CanvasSize, canvasSize: CanvasSize): Base {
  return {
    id: base.id,
    name: base.name,
    position: normalizeVector(base, sourceSize, canvasSize),
    value: base.value,
    threat: 0,
  };
}

function normalizeResource(
  resource: RawResource,
  sourceSize: CanvasSize,
  canvasSize: CanvasSize,
): Resource {
  const position = normalizeVector(resource, sourceSize, canvasSize);

  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    position,
    speed: resource.type === "drone" ? 3 : resource.type === "air-defense" ? 2 : 1.5,
    range: resource.type === "air-defense" ? 220 : resource.type === "drone" ? 150 : 120,
    cooldown: 0,
    available: true,
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
    bases: validatedMap.bases.map((base) => normalizeBase(base, sourceSize, canvasSize)),
    resources: validatedMap.resources.map((resource) =>
      normalizeResource(resource, sourceSize, canvasSize),
    ),
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
