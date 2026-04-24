import type {
  AlliedCity,
  AlliedSpawnZone,
  Enemy,
  EnemyBase,
  OrdnanceOwnerCategory,
  OrdnanceProjectile,
  Resource,
} from "../models/entity";

type UnitWithCombat = {
  id: string;
  name?: string;
  position: { x: number; y: number };
  attack: number;
  defense: number;
  health: number;
  ordnance: number;
  ordnanceRange: number;
  ordnanceSpeed: number;
  interceptChance: number;
};

export type CombatUnitCategory =
  | "allied-city"
  | "allied-spawn-zone"
  | "enemy-base"
  | "enemy"
  | "resource";

export type CombatUnitReference = {
  id: string;
  name: string;
  category: CombatUnitCategory;
};

export type CombatLogEvent = {
  id: string;
  tick: number;
  kind: "engagement" | "destroyed" | "ordnance-launched";
  message: string;
  source?: CombatUnitReference;
  target?: CombatUnitReference;
  destroyedUnit?: CombatUnitReference;
  inflictedToTarget?: number;
  inflictedToSource?: number;
};

export type CombatResolutionInput = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemies: Enemy[];
  resources: Resource[];
  projectiles: OrdnanceProjectile[];
  tick: number;
};

export type CombatResolutionResult = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemies: Enemy[];
  resources: Resource[];
  projectiles: OrdnanceProjectile[];
  events: CombatLogEvent[];
};
const cityEngagementRadius = 170;
const baseEngagementRadius = 190;

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}


function getUnitName(unit: { id: string; name?: string }): string {
  return unit.name ?? unit.id;
}

function getUnitReference(
  unit: { id: string; name?: string },
  category: CombatUnitCategory,
): CombatUnitReference {
  return {
    id: unit.id,
    name: getUnitName(unit),
    category,
  };
}

function createExchangeEvent(
  tick: number,
  source: UnitWithCombat,
  sourceCategory: CombatUnitCategory,
  target: UnitWithCombat,
  targetCategory: CombatUnitCategory,
  inflictedToTarget: number = 0,
  inflictedToSource: number = 0,
): CombatLogEvent {
  return {
    id: `${tick}-engage-${source.id}-${target.id}`,
    tick,
    kind: "ordnance-launched",
    source: getUnitReference(source, sourceCategory),
    target: getUnitReference(target, targetCategory),
    inflictedToTarget,
    inflictedToSource,
    message: `${getUnitName(source)} launched ordnance at ${getUnitName(target)}.`,
  };
}

function createDestroyedEvent(
  tick: number,
  unit: UnitWithCombat,
  category: CombatUnitCategory,
): CombatLogEvent {
  return {
    id: `${tick}-destroyed-${unit.id}`,
    tick,
    kind: "destroyed",
    destroyedUnit: getUnitReference(unit, category),
    message: `${getUnitName(unit)} was destroyed.`,
  };
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

function launchProjectile(
  tick: number,
  shooter: UnitWithCombat,
  shooterCategory: OrdnanceOwnerCategory,
  target: UnitWithCombat,
  targetCategory: OrdnanceOwnerCategory,
  projectiles: OrdnanceProjectile[],
  events: CombatLogEvent[],
): void {
  // #region agent log
  fetch("http://127.0.0.1:7927/ingest/66535b8d-fe12-47cb-8927-8d573246bf36", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2bbcd1" },
    body: JSON.stringify({
      sessionId: "2bbcd1",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "src/engine/combat.ts:160",
      message: "launchProjectile input snapshot",
      data: {
        shooterId: shooter.id,
        shooterCategory,
        targetId: target.id,
        shooterHasPosition: Boolean(shooter.position),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (shooter.ordnance <= 0) {
    return;
  }
  const dx = target.position.x - shooter.position.x;
  const dy = target.position.y - shooter.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance > shooter.ordnanceRange || distance <= 0.001) {
    return;
  }
  shooter.ordnance = Math.max(0, shooter.ordnance - 1);
  const vx = (dx / distance) * shooter.ordnanceSpeed;
  const vy = (dy / distance) * shooter.ordnanceSpeed;
  const projectile: OrdnanceProjectile = {
    id: `${tick}-${shooter.id}-${target.id}-${projectiles.length + 1}`,
    ownerId: shooter.id,
    ownerCategory: shooterCategory,
    targetId: target.id,
    targetCategory,
    position: { ...shooter.position },
    velocity: { x: vx, y: vy },
    speed: shooter.ordnanceSpeed,
    attack: shooter.attack,
    remainingRange: shooter.ordnanceRange,
    maxRange: shooter.ordnanceRange,
    interceptChance: shooter.interceptChance,
    alive: true,
  };
  projectiles.push(projectile);
  events.push(createExchangeEvent(tick, shooter, shooterCategory, target, targetCategory));
}

export function resolveCombat(input: CombatResolutionInput): CombatResolutionResult {
  // #region agent log
  fetch("http://127.0.0.1:7927/ingest/66535b8d-fe12-47cb-8927-8d573246bf36", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2bbcd1" },
    body: JSON.stringify({
      sessionId: "2bbcd1",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "src/engine/combat.ts:191",
      message: "resolveCombat entry",
      data: {
        cities: input.alliedCities.length,
        bases: input.alliedSpawnZones.length + input.enemyBases.length,
        enemies: input.enemies.length,
        resources: input.resources.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const alliedCities = input.alliedCities.map((city) => ({ ...city }));
  const alliedSpawnZones = input.alliedSpawnZones.map((spawnZone) => ({ ...spawnZone }));
  const enemyBases = input.enemyBases.map((base) => ({ ...base }));
  const enemies = input.enemies.map((enemy) => ({ ...enemy }));
  const resources = input.resources.map((resource) => ({ ...resource }));
  const projectiles = input.projectiles.map((projectile) => ({ ...projectile }));
  const events: CombatLogEvent[] = [];

  for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex += 1) {
    const resource = resources[resourceIndex];
    if (resource.health <= 0 || resource.ordnance <= 0) {
      continue;
    }

    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
      const enemy = enemies[enemyIndex];
      if (enemy.health <= 0) {
        continue;
      }

      const distance = distanceBetween(resource.position, enemy.position);
      if (distance > resource.ordnanceRange) {
        continue;
      }
      launchProjectile(input.tick, resource, "resource", enemy, "enemy", projectiles, events);
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
    if (cityDistance > cityEngagementRadius) {
      continue;
    }
    launchProjectile(input.tick, enemy, "enemy", targetCity, "allied-city", projectiles, events);
  }

  for (let baseIndex = 0; baseIndex < alliedSpawnZones.length; baseIndex += 1) {
    const alliedBase = alliedSpawnZones[baseIndex];
    if (alliedBase.health <= 0 || alliedBase.ordnance <= 0) {
      continue;
    }

    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
      const enemy = enemies[enemyIndex];
      if (enemy.health <= 0) {
        continue;
      }

      const distance = distanceBetween(enemy.position, alliedBase.position);
      if (distance > baseEngagementRadius) {
        continue;
      }

      launchProjectile(
        input.tick,
        alliedBase,
        "allied-spawn-zone",
        enemy,
        "enemy",
        projectiles,
        events,
      );
      break;
    }
  }

  for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex += 1) {
    const resource = resources[resourceIndex];
    if (resource.health <= 0 || resource.ordnance <= 0) {
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

      launchProjectile(
        input.tick,
        resource,
        "resource",
        enemyBase,
        "enemy-base",
        projectiles,
        events,
      );
      break;
    }
  }

  for (const city of alliedCities) {
    if (city.health <= 0 || city.ordnance <= 0) {
      continue;
    }
    const target = enemies.find(
      (enemy) =>
        enemy.health > 0 && distanceBetween(city.position, enemy.position) <= city.ordnanceRange,
    );
    if (target) {
      launchProjectile(input.tick, city, "allied-city", target, "enemy", projectiles, events);
    }
  }

  for (const enemyBase of enemyBases) {
    if (enemyBase.health <= 0 || enemyBase.ordnance <= 0) {
      continue;
    }
    const target = resources.find(
      (resource) =>
        resource.health > 0 &&
        distanceBetween(enemyBase.position, resource.position) <= enemyBase.ordnanceRange,
    );
    if (target) {
      launchProjectile(
        input.tick,
        enemyBase,
        "enemy-base",
        target,
        "resource",
        projectiles,
        events,
      );
    }
  }

  for (const unit of [...alliedCities, ...alliedSpawnZones, ...enemyBases, ...enemies, ...resources]) {
    if (unit.health <= 0) {
      events.push(createDestroyedEvent(input.tick, unit, "resource"));
    }
  }

  return {
    alliedCities: alliedCities.filter((city) => city.health > 0),
    alliedSpawnZones: alliedSpawnZones.filter((spawnZone) => spawnZone.health > 0),
    enemyBases: enemyBases.filter((base) => base.health > 0),
    enemies: enemies.filter((enemy) => enemy.health > 0),
    resources: resources.filter((resource) => resource.health > 0),
    projectiles: projectiles.filter((projectile) => projectile.alive),
    events,
  };
}
