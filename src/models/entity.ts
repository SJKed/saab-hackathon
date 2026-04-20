export type EnemyType = "attacker" | "flanker" | "recon";
export type ResourceType = "drone" | "air-defense" | "robot";

export interface Vector {
  x: number;
  y: number;
}

export interface Base {
  id: string;
  name?: string;
  position: Vector;
  value: number;
  threat: number;
}

export interface Enemy {
  id: string;
  name?: string;
  position: Vector;
  velocity: Vector;
  type: EnemyType;
  threatLevel: number;
  targetId?: string;
}

export interface Resource {
  id: string;
  name?: string;
  type: ResourceType;
  position: Vector;
  speed: number;
  range: number;
  cooldown: number;
  available: boolean;
}

// Type aliases are useful when importing a "model" naming style elsewhere.
export type VectorModel = Vector;
export type BaseModel = Base;
export type EnemyModel = Enemy;
export type ResourceModel = Resource;

export const mockBases: Base[] = [
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
    threatLevel: 0.9,
    targetId: "B1",
  },
  {
    id: "E2",
    position: { x: 640, y: 90 },
    velocity: { x: -0.25, y: 1.2 },
    type: "flanker",
    threatLevel: 0.7,
    targetId: "B2",
  },
];

export const mockResources: Resource[] = [
  {
    id: "R1",
    type: "drone",
    position: { x: 300, y: 600 },
    speed: 2.8,
    range: 160,
    cooldown: 0,
    available: true,
  },
  {
    id: "R2",
    type: "air-defense",
    position: { x: 520, y: 610 },
    speed: 1.4,
    range: 220,
    cooldown: 3,
    available: true,
  },
  {
    id: "R3",
    type: "robot",
    position: { x: 180, y: 620 },
    speed: 1.1,
    range: 120,
    cooldown: 6,
    available: false,
  },
];
