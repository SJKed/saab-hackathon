import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  TargetType,
  Vector,
  Weapon,
} from "../models/entity";
import {
  clonePlatform,
  distanceBetween,
  getPlatformDisplayName,
  getPlatformTargetType,
  getUsableAmmoCost,
  getWeaponShotInterval,
  isPlatformDeployed,
  isPlatformDestroyed,
  isPlatformStored,
  weaponSupportsTarget,
} from "../models/platform-utils";
import { getSensorEnvelope } from "./intercept";

type ObjectiveUnit = AlliedCity | AlliedSpawnZone | EnemyBase;

export type CombatUnitCategory =
  | "allied-city"
  | "allied-spawn-zone"
  | "enemy-base"
  | "allied-platform"
  | "enemy-platform";

export type CombatUnitReference = {
  id: string;
  name: string;
  category: CombatUnitCategory;
};

export type CombatLogEvent = {
  id: string;
  tick: number;
  kind: "engagement" | "destroyed";
  message: string;
  source?: CombatUnitReference;
  target?: CombatUnitReference;
  destroyedUnit?: CombatUnitReference;
  weaponName?: string;
  weaponClass?: Weapon["weaponClass"];
  inflictedToTarget?: number;
  inflictedToSource?: number;
  sourcePosition?: Vector;
  targetPosition?: Vector;
};

export type CombatResolutionInput = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  tick: number;
};

export type CombatResolutionResult = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  events: CombatLogEvent[];
};

type FireResult = {
  updatedAttacker: MobilePlatform;
  updatedTargetPlatform?: MobilePlatform;
  updatedTargetObjective?: ObjectiveUnit;
  event?: CombatLogEvent;
  destroyedEvent?: CombatLogEvent;
};

const minimumStrikeDistance = 10;
const impactBuffer = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getUnitReference(
  unit: { id: string; name?: string },
  category: CombatUnitCategory,
): CombatUnitReference {
  return {
    id: unit.id,
    name: getPlatformDisplayName(unit),
    category,
  };
}

function createExchangeEvent(
  tick: number,
  source: { id: string; name?: string },
  sourceCategory: CombatUnitCategory,
  sourcePosition: Vector,
  target: { id: string; name?: string },
  targetCategory: CombatUnitCategory,
  targetPosition: Vector,
  weapon: Weapon | undefined,
  inflictedToTarget: number,
  inflictedToSource = 0,
): CombatLogEvent {
  const weaponLabel = weapon ? ` with ${weapon.name}` : "";

  return {
    id: `${tick}-engagement-${source.id}-${target.id}-${weapon?.id ?? "impact"}`,
    tick,
    kind: "engagement",
    source: getUnitReference(source, sourceCategory),
    target: getUnitReference(target, targetCategory),
    weaponName: weapon?.name,
    weaponClass: weapon?.weaponClass,
    inflictedToTarget,
    inflictedToSource,
    sourcePosition: { ...sourcePosition },
    targetPosition: { ...targetPosition },
    message:
      `${getPlatformDisplayName(source)} engaged ${getPlatformDisplayName(target)}` +
      `${weaponLabel}, inflicting ${inflictedToTarget.toFixed(1)} damage.`,
  };
}

function createDestroyedEvent(
  tick: number,
  unit: { id: string; name?: string },
  category: CombatUnitCategory,
  position?: Vector,
): CombatLogEvent {
  return {
    id: `${tick}-destroyed-${unit.id}`,
    tick,
    kind: "destroyed",
    destroyedUnit: getUnitReference(unit, category),
    targetPosition: position ? { ...position } : undefined,
    message: `${getPlatformDisplayName(unit)} was destroyed.`,
  };
}

function getObjectiveCategory(objective: ObjectiveUnit): CombatUnitCategory {
  if ("value" in objective) {
    return "allied-city";
  }

  return objective.id.startsWith("E") ? "enemy-base" : "allied-spawn-zone";
}

function getUsableWeapons(
  attacker: MobilePlatform,
  targetType: TargetType,
  distance: number,
): Weapon[] {
  return attacker.weapons.filter((weapon) => {
    if (weapon.cooldown > 0) {
      return false;
    }

    if (weapon.ammunition < getUsableAmmoCost(weapon)) {
      return false;
    }

    if (!weaponSupportsTarget(weapon, targetType)) {
      return false;
    }

    return distance >= weapon.minRange && distance <= weapon.maxRange;
  });
}

function getTargetDifficulty(targetPlatform: MobilePlatform): number {
  return clamp(
    (1 - targetPlatform.combat.signature) * 0.28 +
      targetPlatform.combat.evasion * 0.34 +
      (targetPlatform.interceptDifficulty ?? 0) * 0.24,
    0,
    0.72,
  );
}

function getWeaponScore(
  attacker: MobilePlatform,
  targetPlatform: MobilePlatform | undefined,
  weapon: Weapon,
  distance: number,
): number {
  const distancePenalty =
    distance <= weapon.effectiveRange
      ? 1
      : clamp(
          1 - (distance - weapon.effectiveRange) /
            Math.max(1, weapon.maxRange - weapon.effectiveRange),
          0.35,
          1,
        );
  const targetDifficulty = targetPlatform ? getTargetDifficulty(targetPlatform) : 0.15;

  return (
    weapon.damagePerHit *
    weapon.accuracy *
    (weapon.probabilityOfKillBase ?? 1) *
    distancePenalty *
    (1 - targetDifficulty) *
    (1 + attacker.sensors.trackingQuality * 0.28)
  );
}

function selectWeapon(
  attacker: MobilePlatform,
  targetType: TargetType,
  distance: number,
  targetPlatform?: MobilePlatform,
): Weapon | undefined {
  const usableWeapons = getUsableWeapons(attacker, targetType, distance);
  if (usableWeapons.length === 0) {
    return undefined;
  }

  let selectedWeapon: Weapon | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const weapon of usableWeapons) {
    const score = getWeaponScore(attacker, targetPlatform, weapon, distance);
    if (score > bestScore) {
      bestScore = score;
      selectedWeapon = weapon;
    }
  }

  return selectedWeapon;
}

function computeHitChance(
  attacker: MobilePlatform,
  targetPlatform: MobilePlatform,
  weapon: Weapon,
  distance: number,
): number {
  const distanceModifier =
    distance <= weapon.effectiveRange
      ? 1
      : clamp(
          1 - (distance - weapon.effectiveRange) /
            Math.max(1, weapon.maxRange - weapon.effectiveRange),
          0.3,
          1,
        );
  const trackingModifier = 0.72 + attacker.sensors.trackingQuality * 0.34;
  const signatureModifier = 0.65 + targetPlatform.combat.signature * 0.42;
  const evasionModifier = 1 - targetPlatform.combat.evasion * 0.48;
  const interceptPenalty =
    targetPlatform.platformClass === "ballisticMissile"
      ? 1 - (targetPlatform.interceptDifficulty ?? 0) * 0.42
      : 1;

  return clamp(
    weapon.accuracy *
      (weapon.probabilityOfKillBase ?? 1) *
      distanceModifier *
      trackingModifier *
      signatureModifier *
      evasionModifier *
      interceptPenalty,
    0.08,
    0.98,
  );
}

function applyWeaponUse(
  attacker: MobilePlatform,
  weapon: Weapon,
): MobilePlatform {
  const ammoCost = getUsableAmmoCost(weapon);
  const cooldown = getWeaponShotInterval(weapon);

  return {
    ...attacker,
    weapons: attacker.weapons.map((currentWeapon) =>
      currentWeapon.id === weapon.id
        ? {
            ...currentWeapon,
            ammunition: Math.max(0, currentWeapon.ammunition - ammoCost),
            cooldown,
          }
        : currentWeapon,
    ),
    status: "engaging",
    velocity: { x: 0, y: 0 },
  };
}

function applyDamageToPlatform(
  target: MobilePlatform,
  rawDamage: number,
): MobilePlatform {
  const mitigatedDamage = rawDamage * (1 - target.combat.armor);
  const durability = Math.max(0, target.combat.durability - mitigatedDamage);

  return {
    ...target,
    combat: {
      ...target.combat,
      durability,
    },
    status: durability <= 0 ? "destroyed" : "engaging",
    velocity: { x: 0, y: 0 },
  };
}

function applyDamageToObjective<T extends ObjectiveUnit>(
  target: T,
  rawDamage: number,
): T {
  const mitigatedDamage = rawDamage * (1 - target.defenseRating);

  return {
    ...target,
    health: Math.max(0, target.health - mitigatedDamage),
  };
}

function resolvePlatformFire(
  tick: number,
  attacker: MobilePlatform,
  targetPlatform: MobilePlatform,
): FireResult {
  const distance = distanceBetween(attacker.position, targetPlatform.position);
  const targetType = getPlatformTargetType(targetPlatform);
  if (distance > getSensorEnvelope(attacker, targetPlatform)) {
    return {
      updatedAttacker: attacker,
      updatedTargetPlatform: targetPlatform,
    };
  }

  const weapon = selectWeapon(attacker, targetType, distance, targetPlatform);
  if (!weapon) {
    return {
      updatedAttacker: attacker,
      updatedTargetPlatform: targetPlatform,
    };
  }

  const updatedAttacker = applyWeaponUse(attacker, weapon);
  const hitChance = computeHitChance(attacker, targetPlatform, weapon, distance);
  const rawDamage = weapon.damagePerHit * (weapon.salvoSize ?? 1) * hitChance;
  const updatedTargetPlatform = applyDamageToPlatform(targetPlatform, rawDamage);
  const event = createExchangeEvent(
    tick,
    updatedAttacker,
    attacker.team === "allied" ? "allied-platform" : "enemy-platform",
    attacker.position,
    updatedTargetPlatform,
    targetPlatform.team === "allied" ? "allied-platform" : "enemy-platform",
    targetPlatform.position,
    weapon,
    rawDamage,
  );
  const destroyedEvent =
    updatedTargetPlatform.combat.durability <= 0
      ? createDestroyedEvent(
          tick,
          updatedTargetPlatform,
          updatedTargetPlatform.team === "allied"
            ? "allied-platform"
            : "enemy-platform",
          targetPlatform.position,
        )
      : undefined;

  return {
    updatedAttacker: {
      ...updatedAttacker,
      engagedWithId: targetPlatform.id,
    },
    updatedTargetPlatform: {
      ...updatedTargetPlatform,
      engagedWithId:
        updatedTargetPlatform.combat.durability > 0 ? attacker.id : undefined,
    },
    event,
    destroyedEvent,
  };
}

function resolveObjectiveFire<T extends ObjectiveUnit>(
  tick: number,
  attacker: MobilePlatform,
  targetObjective: T,
  targetType: TargetType,
): FireResult {
  const distance = distanceBetween(attacker.position, targetObjective.position);
  const weapon = selectWeapon(attacker, targetType, distance);
  if (!weapon) {
    return {
      updatedAttacker: attacker,
      updatedTargetObjective: targetObjective,
    };
  }

  const updatedAttacker = applyWeaponUse(attacker, weapon);
  const baseDamage =
    weapon.damagePerHit *
    (weapon.salvoSize ?? 1) *
    weapon.accuracy *
    (weapon.probabilityOfKillBase ?? 1);
  const updatedTargetObjective = applyDamageToObjective(targetObjective, baseDamage);
  const event = createExchangeEvent(
    tick,
    updatedAttacker,
    attacker.team === "allied" ? "allied-platform" : "enemy-platform",
    attacker.position,
    updatedTargetObjective,
    getObjectiveCategory(updatedTargetObjective),
    targetObjective.position,
    weapon,
    baseDamage,
  );
  const destroyedEvent =
    updatedTargetObjective.health <= 0
      ? createDestroyedEvent(
          tick,
          updatedTargetObjective,
          getObjectiveCategory(updatedTargetObjective),
          targetObjective.position,
        )
      : undefined;

  return {
    updatedAttacker,
    updatedTargetObjective,
    event,
    destroyedEvent,
  };
}

function resolveMissileImpact(
  tick: number,
  missile: MobilePlatform,
  targetCity: AlliedCity,
): { missile: MobilePlatform; city: AlliedCity; events: CombatLogEvent[] } {
  const damage = missile.warheadDamage ?? 0;
  const city = applyDamageToObjective(targetCity, damage);
  const destroyedMissile: MobilePlatform = {
    ...missile,
    combat: {
      ...missile.combat,
      durability: 0,
    },
    status: "destroyed",
    velocity: { x: 0, y: 0 },
    engagedWithId: undefined,
  };
  const events: CombatLogEvent[] = [
    createExchangeEvent(
      tick,
      missile,
      "enemy-platform",
      missile.position,
      city,
      "allied-city",
      targetCity.position,
      undefined,
      damage,
    ),
    createDestroyedEvent(tick, destroyedMissile, "enemy-platform", missile.position),
  ];

  if (city.health <= 0) {
    events.push(createDestroyedEvent(tick, city, "allied-city", targetCity.position));
  }

  return {
    missile: destroyedMissile,
    city,
    events,
  };
}

function syncActiveEngagements(
  alliedPlatforms: MobilePlatform[],
  enemyPlatforms: MobilePlatform[],
): void {
  const liveAlliedIds = new Set(
    alliedPlatforms
      .filter((platform) => isPlatformDeployed(platform))
      .map((platform) => platform.id),
  );
  const liveEnemyIds = new Set(
    enemyPlatforms
      .filter((platform) => isPlatformDeployed(platform))
      .map((platform) => platform.id),
  );

  for (const alliedPlatform of alliedPlatforms) {
    if (alliedPlatform.engagedWithId && !liveEnemyIds.has(alliedPlatform.engagedWithId)) {
      alliedPlatform.engagedWithId = undefined;
      if (alliedPlatform.status === "engaging") {
        alliedPlatform.status = "transit";
      }
    }
  }

  for (const enemyPlatform of enemyPlatforms) {
    if (enemyPlatform.engagedWithId && !liveAlliedIds.has(enemyPlatform.engagedWithId)) {
      enemyPlatform.engagedWithId = undefined;
      if (enemyPlatform.status === "engaging") {
        enemyPlatform.status = "transit";
      }
    }
  }
}

function findCityById(cities: AlliedCity[], cityId: string | undefined): AlliedCity | undefined {
  if (!cityId) {
    return undefined;
  }

  return cities.find((city) => city.id === cityId);
}

function findClosestCity(
  enemyPlatform: MobilePlatform,
  cities: AlliedCity[],
): AlliedCity | undefined {
  if (enemyPlatform.targetId) {
    const assignedCity = findCityById(cities, enemyPlatform.targetId);
    if (assignedCity) {
      return assignedCity;
    }
  }

  let closestCity: AlliedCity | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const distance = distanceBetween(enemyPlatform.position, city.position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestCity = city;
    }
  }

  return closestCity;
}

export function resolveCombat(input: CombatResolutionInput): CombatResolutionResult {
  const alliedCities = input.alliedCities.map((city) => ({ ...city }));
  const alliedSpawnZones = input.alliedSpawnZones.map((spawnZone) => ({ ...spawnZone }));
  const enemyBases = input.enemyBases.map((base) => ({ ...base }));
  const alliedPlatforms = input.alliedPlatforms.map(clonePlatform);
  const enemyPlatforms = input.enemyPlatforms.map(clonePlatform);
  const events: CombatLogEvent[] = [];

  syncActiveEngagements(alliedPlatforms, enemyPlatforms);

  for (let alliedIndex = 0; alliedIndex < alliedPlatforms.length; alliedIndex += 1) {
    let alliedPlatform = alliedPlatforms[alliedIndex];
    if (isPlatformDestroyed(alliedPlatform) || isPlatformStored(alliedPlatform)) {
      continue;
    }

    for (let enemyIndex = 0; enemyIndex < enemyPlatforms.length; enemyIndex += 1) {
      let enemyPlatform = enemyPlatforms[enemyIndex];
      if (isPlatformDestroyed(enemyPlatform) || isPlatformStored(enemyPlatform)) {
        continue;
      }

      if (
        alliedPlatform.engagedWithId &&
        alliedPlatform.engagedWithId !== enemyPlatform.id
      ) {
        continue;
      }

      if (
        enemyPlatform.engagedWithId &&
        enemyPlatform.engagedWithId !== alliedPlatform.id
      ) {
        continue;
      }

      const distance = distanceBetween(alliedPlatform.position, enemyPlatform.position);
      const possibleRange = Math.max(
        alliedPlatform.weapons.reduce(
          (maxRange, weapon) =>
            weaponSupportsTarget(weapon, getPlatformTargetType(enemyPlatform))
              ? Math.max(maxRange, weapon.maxRange)
              : maxRange,
          0,
        ),
        enemyPlatform.weapons.reduce(
          (maxRange, weapon) =>
            weaponSupportsTarget(weapon, getPlatformTargetType(alliedPlatform))
              ? Math.max(maxRange, weapon.maxRange)
              : maxRange,
          0,
        ),
      );

      if (distance > possibleRange + impactBuffer) {
        continue;
      }

      const alliedFire = resolvePlatformFire(
        input.tick,
        alliedPlatform,
        enemyPlatform,
      );
      alliedPlatform = alliedFire.updatedAttacker;
      enemyPlatform = alliedFire.updatedTargetPlatform ?? enemyPlatform;
      if (alliedFire.event) {
        events.push(alliedFire.event);
      }
      if (alliedFire.destroyedEvent) {
        events.push(alliedFire.destroyedEvent);
      }

      if (!isPlatformDestroyed(enemyPlatform)) {
        const enemyFire = resolvePlatformFire(
          input.tick,
          enemyPlatform,
          alliedPlatform,
        );
        enemyPlatform = enemyFire.updatedAttacker;
        alliedPlatform = enemyFire.updatedTargetPlatform ?? alliedPlatform;
        if (enemyFire.event) {
          events.push(enemyFire.event);
        }
        if (enemyFire.destroyedEvent) {
          events.push(enemyFire.destroyedEvent);
        }
      }

      alliedPlatforms[alliedIndex] = alliedPlatform;
      enemyPlatforms[enemyIndex] = enemyPlatform;

      if (alliedPlatform.engagedWithId || enemyPlatform.engagedWithId) {
        break;
      }
    }
  }

  for (let enemyIndex = 0; enemyIndex < enemyPlatforms.length; enemyIndex += 1) {
    const enemyPlatform = enemyPlatforms[enemyIndex];
    if (
      isPlatformDestroyed(enemyPlatform) ||
      isPlatformStored(enemyPlatform) ||
      enemyPlatform.engagedWithId
    ) {
      continue;
    }

    const targetCity = findClosestCity(enemyPlatform, alliedCities);
    if (!targetCity) {
      continue;
    }

    const cityIndex = alliedCities.findIndex((city) => city.id === targetCity.id);
    if (cityIndex < 0) {
      continue;
    }

    const distanceToCity = distanceBetween(enemyPlatform.position, targetCity.position);
    if (
      enemyPlatform.platformClass === "ballisticMissile" &&
      distanceToCity <= (enemyPlatform.impactRadius ?? minimumStrikeDistance)
    ) {
      const impact = resolveMissileImpact(input.tick, enemyPlatform, targetCity);
      enemyPlatforms[enemyIndex] = impact.missile;
      alliedCities[cityIndex] = impact.city;
      events.push(...impact.events);
      continue;
    }

    if (distanceToCity > minimumStrikeDistance + 28) {
      continue;
    }

    const strike = resolveObjectiveFire(
      input.tick,
      enemyPlatform,
      targetCity,
      "city",
    );
    enemyPlatforms[enemyIndex] = strike.updatedAttacker;
    if (strike.updatedTargetObjective) {
      alliedCities[cityIndex] = strike.updatedTargetObjective as AlliedCity;
    }
    if (strike.event) {
      events.push(strike.event);
    }
    if (strike.destroyedEvent) {
      events.push(strike.destroyedEvent);
    }
  }

  return {
    alliedCities: alliedCities.filter((city) => city.health > 0),
    alliedSpawnZones: alliedSpawnZones.filter((spawnZone) => spawnZone.health > 0),
    enemyBases: enemyBases.filter((base) => base.health > 0),
    alliedPlatforms: alliedPlatforms.filter(
      (platform) => !isPlatformDestroyed(platform),
    ),
    enemyPlatforms: enemyPlatforms.filter(
      (platform) => !isPlatformDestroyed(platform),
    ),
    events,
  };
}
