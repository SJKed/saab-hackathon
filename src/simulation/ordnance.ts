import type {
  AlliedCity,
  AlliedSpawnZone,
  Enemy,
  EnemyBase,
  OrdnanceOwnerCategory,
  OrdnanceProjectile,
  Resource,
} from "../models/entity";
import type { CombatLogEvent } from "../engine/combat";

type UnitCollections = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemies: Enemy[];
  resources: Resource[];
};

type OrdnanceResolutionInput = UnitCollections & {
  projectiles: OrdnanceProjectile[];
  tick: number;
  deltaSeconds: number;
};

type OrdnanceResolutionResult = UnitCollections & {
  projectiles: OrdnanceProjectile[];
  events: CombatLogEvent[];
  stats: {
    launched: number;
    intercepted: number;
    impacted: number;
    expired: number;
  };
};

const impactRadius = 7;
const interceptionRadius = 48;

function calculateDamage(attack: number, defense: number): number {
  const normalizedDefense = Math.max(1, defense);
  return ((attack * (attack / normalizedDefense)) / 50) + 2;
}

function collectDefenders(input: UnitCollections): Array<{
  id: string;
  category: OrdnanceOwnerCategory;
  position: { x: number; y: number };
  interceptChance: number;
}> {
  return [
    ...input.alliedCities.map((unit) => ({
      id: unit.id,
      category: "allied-city" as const,
      position: unit.position,
      interceptChance: unit.interceptChance,
    })),
    ...input.alliedSpawnZones.map((unit) => ({
      id: unit.id,
      category: "allied-spawn-zone" as const,
      position: unit.position,
      interceptChance: unit.interceptChance,
    })),
    ...input.enemyBases.map((unit) => ({
      id: unit.id,
      category: "enemy-base" as const,
      position: unit.position,
      interceptChance: unit.interceptChance,
    })),
    ...input.enemies.map((unit) => ({
      id: unit.id,
      category: "enemy" as const,
      position: unit.position,
      interceptChance: unit.interceptChance,
    })),
    ...input.resources.map((unit) => ({
      id: unit.id,
      category: "resource" as const,
      position: unit.position,
      interceptChance: unit.interceptChance,
    })),
  ];
}

function applyImpactDamage(
  projectile: OrdnanceProjectile,
  input: UnitCollections,
): void {
  const apply = (unit: { id: string; defense: number; health: number }[]): void => {
    const target = unit.find((item) => item.id === projectile.targetId);
    if (!target) {
      return;
    }
    target.health = Math.max(
      0,
      target.health - calculateDamage(projectile.attack, target.defense),
    );
  };

  switch (projectile.targetCategory) {
    case "allied-city":
      apply(input.alliedCities);
      break;
    case "allied-spawn-zone":
      apply(input.alliedSpawnZones);
      break;
    case "enemy-base":
      apply(input.enemyBases);
      break;
    case "enemy":
      apply(input.enemies);
      break;
    case "resource":
      apply(input.resources);
      break;
  }
}

export function resolveOrdnance(input: OrdnanceResolutionInput): OrdnanceResolutionResult {
  const events: CombatLogEvent[] = [];
  const stats = { launched: 0, intercepted: 0, impacted: 0, expired: 0 };
  const alliedCities = input.alliedCities.map((item) => ({ ...item }));
  const alliedSpawnZones = input.alliedSpawnZones.map((item) => ({ ...item }));
  const enemyBases = input.enemyBases.map((item) => ({ ...item }));
  const enemies = input.enemies.map((item) => ({ ...item }));
  const resources = input.resources.map((item) => ({ ...item }));
  const projectiles = input.projectiles.map((item) => ({ ...item }));
  const defenders = collectDefenders({
    alliedCities,
    alliedSpawnZones,
    enemyBases,
    enemies,
    resources,
  });
  stats.launched = projectiles.length;

  for (const projectile of projectiles) {
    if (!projectile.alive) {
      continue;
    }
    const stepDistance = projectile.speed * Math.max(0, input.deltaSeconds);
    const speedNorm = Math.hypot(projectile.velocity.x, projectile.velocity.y);
    if (speedNorm > 0.001) {
      const dirX = projectile.velocity.x / speedNorm;
      const dirY = projectile.velocity.y / speedNorm;
      projectile.position = {
        x: projectile.position.x + dirX * stepDistance,
        y: projectile.position.y + dirY * stepDistance,
      };
    }
    projectile.remainingRange -= stepDistance;

    const interceptor = defenders.find((defender) => {
      if (defender.category === projectile.ownerCategory) {
        return false;
      }
      const distance = Math.hypot(
        defender.position.x - projectile.position.x,
        defender.position.y - projectile.position.y,
      );
      return distance <= interceptionRadius && Math.random() < defender.interceptChance;
    });
    if (interceptor) {
      projectile.alive = false;
      stats.intercepted += 1;
      events.push({
        id: `${input.tick}-intercept-${interceptor.id}-${projectile.id}`,
        tick: input.tick,
        kind: "engagement",
        message: `${interceptor.id} intercepted ordnance from ${projectile.ownerId}.`,
      });
      continue;
    }

    const targetUnit = defenders.find((defender) => defender.id === projectile.targetId);
    if (targetUnit) {
      const distanceToTarget = Math.hypot(
        targetUnit.position.x - projectile.position.x,
        targetUnit.position.y - projectile.position.y,
      );
      if (distanceToTarget <= impactRadius) {
        projectile.alive = false;
        stats.impacted += 1;
        applyImpactDamage(projectile, {
          alliedCities,
          alliedSpawnZones,
          enemyBases,
          enemies,
          resources,
        });
        events.push({
          id: `${input.tick}-impact-${projectile.id}`,
          tick: input.tick,
          kind: "engagement",
          message: `Ordnance from ${projectile.ownerId} impacted ${projectile.targetId}.`,
        });
        continue;
      }
    }

    if (projectile.remainingRange <= 0) {
      projectile.alive = false;
      stats.expired += 1;
      events.push({
        id: `${input.tick}-expired-${projectile.id}`,
        tick: input.tick,
        kind: "engagement",
        message: `Ordnance from ${projectile.ownerId} expired before impact.`,
      });
    }
  }

  return {
    alliedCities: alliedCities.filter((unit) => unit.health > 0),
    alliedSpawnZones: alliedSpawnZones.filter((unit) => unit.health > 0),
    enemyBases: enemyBases.filter((unit) => unit.health > 0),
    enemies: enemies.filter((unit) => unit.health > 0),
    resources: resources.filter((unit) => unit.health > 0),
    projectiles: projectiles.filter((projectile) => projectile.alive),
    events,
    stats,
  };
}
