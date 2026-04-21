export type EnemyType = "attacker" | "flanker" | "recon";
export type EnemyPlatform = "airplane" | "drone";
export type ResourceType = "drone" | "air-defense" | "robot";

export interface Vector {
  x: number;
  y: number;
}

export interface AlliedCity {
  id: string;
  name?: string;
  position: Vector;
  value: number;
  threat: number;
}

export interface AlliedSpawnZone {
  id: string;
  name?: string;
  position: Vector;
}

export interface EnemyBase {
  id: string;
  name?: string;
  position: Vector;
}

export interface Enemy {
  id: string;
  name?: string;
  position: Vector;
  velocity: Vector;
  type: EnemyType;
  platform: EnemyPlatform;
  threatLevel: number;
  originBaseId?: string;
  targetId?: string;
}

export interface Resource {
  id: string;
  name?: string;
  type: ResourceType;
  position: Vector;
  velocity: Vector;
  speed: number;
  range: number;
  cooldown: number;
  available: boolean;
  originSpawnZoneId?: string;
}

// Type aliases are useful when importing a "model" naming style elsewhere.
export type VectorModel = Vector;
export type BaseModel = AlliedCity;
export type AlliedCityModel = AlliedCity;
export type AlliedSpawnZoneModel = AlliedSpawnZone;
export type EnemyBaseModel = EnemyBase;
export type EnemyModel = Enemy;
export type ResourceModel = Resource;

export const mockAlliedCities: AlliedCity[] = [
  {
    id: "B1",
    position: { x: 260, y: 560 },
    value: 10,
    threat: 0.45,
  },
  {
    id: "B2",
    position: { x: 560, y: 520 },
    value: 8,
    threat: 0.3,
  },
];

export const mockEnemies: Enemy[] = [
  {
    id: "E1",
    position: { x: 280, y: 60 },
    velocity: { x: 0.2, y: 1.5 },
    type: "attacker",
    platform: "airplane",
    threatLevel: 0.9,
    originBaseId: "EB1",
    targetId: "B1",
  },
  {
    id: "E2",
    position: { x: 640, y: 90 },
    velocity: { x: -0.25, y: 1.2 },
    type: "flanker",
    platform: "drone",
    threatLevel: 0.7,
    originBaseId: "EB2",
    targetId: "B2",
  },
];

export const mockResources: Resource[] = [
  {
    id: "R1",
    type: "drone",
    position: { x: 300, y: 600 },
    velocity: { x: 0, y: 0 },
    speed: 2.8,
    range: 160,
    cooldown: 0,
    available: true,
    originSpawnZoneId: "AS1",
  },
  {
    id: "R2",
    type: "air-defense",
    position: { x: 520, y: 610 },
    velocity: { x: 0, y: 0 },
    speed: 1.4,
    range: 220,
    cooldown: 3,
    available: true,
    originSpawnZoneId: "AS2",
  },
  {
    id: "R3",
    type: "robot",
    position: { x: 180, y: 620 },
    velocity: { x: 0, y: 0 },
    speed: 1.1,
    range: 120,
    cooldown: 6,
    available: false,
    originSpawnZoneId: "AS3",
  },
];
