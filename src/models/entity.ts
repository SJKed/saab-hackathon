export type EnemyType = "attacker" | "flanker" | "recon";
export type EnemyPlatform = "airplane" | "drone";
export type ResourceType = "drone" | "air-defense" | "robot";

export interface Vector {
  x: number;
  y: number;
}

export interface CombatStats {
  attack: number;
  defense: number;
  health: number;
}

export interface AlliedCity extends CombatStats {
  id: string;
  name?: string;
  position: Vector;
  value: number;
  threat: number;
}

export interface AlliedSpawnZone extends CombatStats {
  id: string;
  name?: string;
  position: Vector;
}

export interface EnemyBase extends CombatStats {
  id: string;
  name?: string;
  position: Vector;
}

export interface Enemy extends CombatStats {
  id: string;
  name?: string;
  position: Vector;
  velocity: Vector;
  engagedWithId?: string;
  type: EnemyType;
  platform: EnemyPlatform;
  threatLevel: number;
  originBaseId?: string;
  targetId?: string;
}

export interface Resource extends CombatStats {
  id: string;
  name?: string;
  type: ResourceType;
  position: Vector;
  velocity: Vector;
  engagedWithId?: string;
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
    attack: 42,
    defense: 56,
    health: 260,
  },
  {
    id: "B2",
    position: { x: 560, y: 520 },
    value: 8,
    threat: 0.3,
    attack: 42,
    defense: 56,
    health: 260,
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
    engagedWithId: undefined,
    attack: 58,
    defense: 40,
    health: 118,
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
    engagedWithId: undefined,
    attack: 36,
    defense: 30,
    health: 82,
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
    engagedWithId: undefined,
    attack: 38,
    defense: 28,
    health: 78,
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
    engagedWithId: undefined,
    attack: 52,
    defense: 46,
    health: 125,
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
    engagedWithId: undefined,
    attack: 44,
    defense: 40,
    health: 112,
  },
];
