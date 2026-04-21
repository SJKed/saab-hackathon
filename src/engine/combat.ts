import type {
  AlliedCity,
  AlliedSpawnZone,
  Enemy,
  EnemyBase,
  Resource,
} from "../models/entity";

type UnitWithCombat = {
  id: string;
  name?: string;
  attack: number;
  defense: number;
  health: number;
};

export type CombatLogEvent = {
  id: string;
  tick: number;
  message: string;
};

export type CombatResolutionInput = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemies: Enemy[];
  resources: Resource[];
  tick: number;
};

export type CombatResolutionResult = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemies: Enemy[];
  resources: Resource[];
  events: CombatLogEvent[];
};

const resourceEngagementRadius = 12;
const baseEngagementRadius = 20;

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function calculateDamage(attacker: UnitWithCombat, defender: UnitWithCombat): number {
  const normalizedDefense = Math.max(1, defender.defense);
  return ((attacker.attack * (attacker.attack / normalizedDefense)) / 50) + 2;
}

function applyMutualDamage(attacker: UnitWithCombat, defender: UnitWithCombat): {
  inflictedToDefender: number;
  inflictedToAttacker: number;
} {
  const inflictedToDefender = calculateDamage(attacker, defender);
  const inflictedToAttacker = calculateDamage(defender, attacker);

  attacker.health = Math.max(0, attacker.health - inflictedToAttacker);
  defender.health = Math.max(0, defender.health - inflictedToDefender);

  return {
    inflictedToDefender,
    inflictedToAttacker,
  };
}

function getUnitName(unit: { id: string; name?: string }): string {
  return unit.name ?? unit.id;
}

function createExchangeEvent(
  tick: number,
  source: UnitWithCombat,
  target: UnitWithCombat,
  inflictedToTarget: number,
  inflictedToSource: number,
): CombatLogEvent {
  return {
    id: `${tick}-engage-${source.id}-${target.id}`,
    tick,
    message: `${getUnitName(source)} engaged ${getUnitName(target)}. ${getUnitName(source)} dealt ${inflictedToTarget.toFixed(2)} and received ${inflictedToSource.toFixed(2)} damage.`,
  };
}

function createDestroyedEvent(tick: number, unit: UnitWithCombat): CombatLogEvent {
  return {
    id: `${tick}-destroyed-${unit.id}`,
    tick,
    message: `${getUnitName(unit)} was destroyed.`,
  };
}

function syncActiveEngagements(resources: Resource[], enemies: Enemy[]): void {
  const liveEnemyIds = new Set(enemies.filter((enemy) => enemy.health > 0).map((enemy) => enemy.id));
  const liveResourceIds = new Set(
    resources.filter((resource) => resource.health > 0).map((resource) => resource.id),
  );

  for (const resource of resources) {
    if (resource.engagedWithId && !liveEnemyIds.has(resource.engagedWithId)) {
      resource.engagedWithId = undefined;
    }
  }

  for (const enemy of enemies) {
    if (enemy.engagedWithId && !liveResourceIds.has(enemy.engagedWithId)) {
      enemy.engagedWithId = undefined;
    }
  }
}

function setResourceEngagement(resource: Resource, enemy: Enemy): void {
  resource.engagedWithId = enemy.id;
  enemy.engagedWithId = resource.id;
  resource.velocity = { x: 0, y: 0 };
  enemy.velocity = { x: 0, y: 0 };
}

function findClosestCity(enemy: Enemy, cities: AlliedCity[]): AlliedCity | undefined {
  if (enemy.targetId) {
    const target = cities.find((city) => city.id === enemy.targetId);
    if (target) {
      return target;
    }
  }

  let closest: AlliedCity | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const distance = distanceBetween(enemy.position, city.position);
    if (distance < closestDistance) {
      closest = city;
      closestDistance = distance;
    }
  }

  return closest;
}

export function resolveCombat(input: CombatResolutionInput): CombatResolutionResult {
  const alliedCities = input.alliedCities.map((city) => ({ ...city }));
  const alliedSpawnZones = input.alliedSpawnZones.map((spawnZone) => ({ ...spawnZone }));
  const enemyBases = input.enemyBases.map((base) => ({ ...base }));
  const enemies = input.enemies.map((enemy) => ({ ...enemy }));
  const resources = input.resources.map((resource) => ({ ...resource }));
  const events: CombatLogEvent[] = [];

  syncActiveEngagements(resources, enemies);

  for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex += 1) {
    const resource = resources[resourceIndex];
    if (resource.health <= 0) {
      continue;
    }

    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
      const enemy = enemies[enemyIndex];
      if (enemy.health <= 0) {
        continue;
      }

      if (resource.engagedWithId && resource.engagedWithId !== enemy.id) {
        continue;
      }

      if (enemy.engagedWithId && enemy.engagedWithId !== resource.id) {
        continue;
      }

      const distance = distanceBetween(resource.position, enemy.position);
      const isPersistentEngagement =
        resource.engagedWithId === enemy.id && enemy.engagedWithId === resource.id;
      if (!isPersistentEngagement && distance > resourceEngagementRadius) {
        continue;
      }

      setResourceEngagement(resource, enemy);

      const { inflictedToDefender, inflictedToAttacker } = applyMutualDamage(resource, enemy);
      events.push(
        createExchangeEvent(
          input.tick,
          resource,
          enemy,
          inflictedToDefender,
          inflictedToAttacker,
        ),
      );

      if (enemy.health <= 0) {
        resource.engagedWithId = undefined;
        enemy.engagedWithId = undefined;
        events.push(createDestroyedEvent(input.tick, enemy));
      }

      if (resource.health <= 0) {
        resource.engagedWithId = undefined;
        enemy.engagedWithId = undefined;
        events.push(createDestroyedEvent(input.tick, resource));
      }

      break;
    }
  }

  for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
    const enemy = enemies[enemyIndex];
    if (enemy.health <= 0) {
      continue;
    }

    const targetCity = findClosestCity(enemy, alliedCities);
    if (!targetCity) {
      continue;
    }

    const cityDistance = distanceBetween(enemy.position, targetCity.position);
    if (cityDistance > baseEngagementRadius) {
      continue;
    }

    const { inflictedToDefender, inflictedToAttacker } = applyMutualDamage(enemy, targetCity);
    events.push(
      createExchangeEvent(
        input.tick,
        enemy,
        targetCity,
        inflictedToDefender,
        inflictedToAttacker,
      ),
    );

    if (targetCity.health <= 0) {
      events.push(createDestroyedEvent(input.tick, targetCity));
    }

    if (enemy.health <= 0) {
      events.push(createDestroyedEvent(input.tick, enemy));
      continue;
    }
  }

  for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex += 1) {
    const resource = resources[resourceIndex];
    if (resource.health <= 0) {
      continue;
    }

    if (resource.engagedWithId != null) {
      continue;
    }

    for (let baseIndex = 0; baseIndex < enemyBases.length; baseIndex += 1) {
      const enemyBase = enemyBases[baseIndex];
      if (enemyBase.health <= 0) {
        continue;
      }

      const distance = distanceBetween(resource.position, enemyBase.position);
      if (distance > baseEngagementRadius) {
        continue;
      }

      const { inflictedToDefender, inflictedToAttacker } = applyMutualDamage(resource, enemyBase);
      events.push(
        createExchangeEvent(
          input.tick,
          resource,
          enemyBase,
          inflictedToDefender,
          inflictedToAttacker,
        ),
      );

      if (enemyBase.health <= 0) {
        events.push(createDestroyedEvent(input.tick, enemyBase));
      }

      if (resource.health <= 0) {
        events.push(createDestroyedEvent(input.tick, resource));
      }

      break;
    }
  }

  return {
    alliedCities: alliedCities.filter((city) => city.health > 0),
    alliedSpawnZones: alliedSpawnZones.filter((spawnZone) => spawnZone.health > 0),
    enemyBases: enemyBases.filter((base) => base.health > 0),
    enemies: enemies.filter((enemy) => enemy.health > 0),
    resources: resources.filter((resource) => resource.health > 0),
    events,
  };
}
