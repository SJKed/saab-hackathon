import type {
  AlliedCity,
  AlliedSpawnZone,
  CombatPhase,
  EnemyBase,
  MobilePlatform,
  TargetType,
  Vector,
  Weapon,
} from "../models/entity";
import { distanceKm, kmToRaw } from "../models/distance";
import type { DebugSettings } from "../models/debug";
import { hasReachedLatestSafeRecallMoment } from "../models/platform-recovery";
import {
  clonePlatform,
  getPlatformDisplayName,
  getPrimaryPayloadWeapon,
  getPlatformTargetType,
  getPreferredCombatRange,
  getUsableAmmoCost,
  getWeaponPayloadDamage,
  getWeaponShotInterval,
  getWeaponsForTarget,
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

export type CombatOutcome = "miss" | "hit" | "critical";

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
  outcome?: CombatOutcome;
};

export type CombatResolutionInput = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  detectedEnemyIds?: string[];
  tick: number;
  debugSettings: DebugSettings;
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

const minimumStrikeDistance = 3;
const impactBuffer = 1.2;
const attackRunWindowSeconds = 0.75;
const repositionWindowSeconds = 1.1;
const evadeWindowSeconds = 0.8;
const disengageWindowSeconds = 2.2;
const durabilityRetreatRatio = 0.24;
const lockLossRangeMultiplier = 1.55;
const deadlockRelativeSpeedThreshold = 9;
const deadlockDistanceThreshold = 26;
const orbitTimeoutSeconds = 1.9;
const mergeDistanceThreshold = 18;
const overshootClosureThreshold = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDurabilityRatio(platform: MobilePlatform): number {
  return (
    platform.combat.durability / Math.max(1, platform.combat.maxDurability)
  );
}

function getPlatformSpeed(platform: MobilePlatform): number {
  return Math.hypot(platform.velocity.x, platform.velocity.y);
}

function getRelativeSpeed(
  platform: MobilePlatform,
  target: MobilePlatform,
): number {
  return Math.hypot(
    platform.velocity.x - target.velocity.x,
    platform.velocity.y - target.velocity.y,
  );
}

function getClosureRate(
  platform: MobilePlatform,
  target: MobilePlatform,
): number {
  const relativePositionX = target.position.x - platform.position.x;
  const relativePositionY = target.position.y - platform.position.y;
  const relativeVelocityX = target.velocity.x - platform.velocity.x;
  const relativeVelocityY = target.velocity.y - platform.velocity.y;
  const distance = Math.hypot(relativePositionX, relativePositionY);
  if (distance <= 0.0001) {
    return 0;
  }

  return -(
    (relativePositionX * relativeVelocityX +
      relativePositionY * relativeVelocityY) /
    distance
  );
}

function getEngagementRoleScore(platform: MobilePlatform): number {
  const roleScore =
    platform.role === "interceptor"
      ? 1.25
      : platform.role === "strike"
        ? 1.1
        : platform.role === "patrol"
          ? 0.9
          : 0.72;
  const classScore =
    platform.platformClass === "fighterJet"
      ? 0.28
      : platform.platformClass === "drone"
        ? 0.12
        : 0;

  return roleScore + classScore + platform.threatLevel * 0.22;
}

function isPressingPlatform(
  platform: MobilePlatform,
  target: MobilePlatform,
): boolean {
  const platformScore = getEngagementRoleScore(platform);
  const targetScore = getEngagementRoleScore(target);
  if (Math.abs(platformScore - targetScore) > 0.01) {
    return platformScore > targetScore;
  }

  return platform.id.localeCompare(target.id) <= 0;
}

function isEngagementDeadlocked(
  platform: MobilePlatform,
  target: MobilePlatform,
  preferredRange: number,
  distance: number,
): boolean {
  const distanceRaw = kmToRaw(distance);
  const preferredRangeRaw = kmToRaw(preferredRange);

  return (
    distanceRaw <= Math.max(deadlockDistanceThreshold, preferredRangeRaw * 0.9) &&
    getRelativeSpeed(platform, target) <= deadlockRelativeSpeedThreshold &&
    getPlatformSpeed(platform) <= deadlockRelativeSpeedThreshold &&
    getPlatformSpeed(target) <= deadlockRelativeSpeedThreshold
  );
}

function isMergeOrOvershoot(
  platform: MobilePlatform,
  target: MobilePlatform,
  preferredRange: number,
  distance: number,
): boolean {
  const distanceRaw = kmToRaw(distance);
  const preferredRangeRaw = kmToRaw(preferredRange);

  return (
    distanceRaw <= Math.max(mergeDistanceThreshold, preferredRangeRaw * 0.72) &&
    getClosureRate(platform, target) <= overshootClosureThreshold
  );
}

function setCombatPhase(
  platform: MobilePlatform,
  combatPhase: CombatPhase | undefined,
  options?: {
    engagedWithId?: string;
    disengageReason?: string;
    preserveTimer?: boolean;
  },
): MobilePlatform {
  const phaseChanged = platform.combatPhase !== combatPhase;

  return {
    ...platform,
    engagedWithId: options?.engagedWithId ?? platform.engagedWithId,
    combatPhase,
    combatPhaseTimeSeconds:
      combatPhase && (options?.preserveTimer || !phaseChanged)
        ? platform.combatPhaseTimeSeconds
        : 0,
    disengageReason: options?.disengageReason,
  };
}

function clearCombatState(platform: MobilePlatform): MobilePlatform {
  return {
    ...platform,
    engagedWithId: undefined,
    combatPhase: undefined,
    combatPhaseTimeSeconds: 0,
    disengageReason: undefined,
  };
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
  options?: {
    inflictedToSource?: number;
    outcome?: CombatOutcome;
  },
): CombatLogEvent {
  const weaponLabel = weapon ? ` with ${weapon.name}` : "";
  const outcome = options?.outcome ?? "hit";
  const inflictedToSource = options?.inflictedToSource ?? 0;
  const message =
    outcome === "miss"
      ? `${getPlatformDisplayName(source)} engaged ${getPlatformDisplayName(target)}${weaponLabel}, but missed.`
      : outcome === "critical"
        ? `${getPlatformDisplayName(source)} struck ${getPlatformDisplayName(target)}${weaponLabel} with a critical hit for ${inflictedToTarget.toFixed(1)} damage.`
        : `${getPlatformDisplayName(source)} engaged ${getPlatformDisplayName(target)}${weaponLabel}, inflicting ${inflictedToTarget.toFixed(1)} damage.`;

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
    outcome,
    message,
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

function createStatusEvent(
  tick: number,
  unit: MobilePlatform,
  message: string,
): CombatLogEvent {
  return {
    id: `${tick}-status-${unit.id}-${message.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    tick,
    kind: "engagement",
    source: getUnitReference(
      unit,
      unit.team === "allied" ? "allied-platform" : "enemy-platform",
    ),
    sourcePosition: { ...unit.position },
    message,
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
  const durabilityRatio = getDurabilityRatio(targetPlatform);
  const effectiveEvasion =
    targetPlatform.combat.evasion * (0.45 + durabilityRatio * 0.55);

  return clamp(
    (1 - targetPlatform.combat.signature) * 0.28 +
      effectiveEvasion * 0.34 +
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

function getPlatformEngagementRange(
  attacker: MobilePlatform,
  targetType: TargetType,
): number {
  const weaponRange = attacker.weapons.reduce(
    (maxRange, weapon) =>
      weaponSupportsTarget(weapon, targetType)
        ? Math.max(maxRange, weapon.maxRange)
        : maxRange,
    0,
  );

  if (!attacker.oneWay) {
    return weaponRange;
  }

  return Math.max(
    weaponRange,
    minimumStrikeDistance,
  );
}

function computeHitChance(
  attacker: MobilePlatform,
  targetPlatform: MobilePlatform,
  weapon: Weapon,
  distance: number,
): number {
  const attackerDurabilityRatio = getDurabilityRatio(attacker);
  const targetDurabilityRatio = getDurabilityRatio(targetPlatform);
  const distanceModifier =
    distance <= weapon.effectiveRange
      ? 1
      : clamp(
          1 - (distance - weapon.effectiveRange) /
            Math.max(1, weapon.maxRange - weapon.effectiveRange),
          0.3,
          1,
        );
  const trackingModifier =
    (0.72 + attacker.sensors.trackingQuality * 0.34) *
    (0.7 + attackerDurabilityRatio * 0.3);
  const signatureModifier = 0.65 + targetPlatform.combat.signature * 0.42;
  const evasionModifier =
    1 -
    targetPlatform.combat.evasion *
      (0.42 + targetDurabilityRatio * 0.58) *
      0.48;
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

function getPhaseDamageMultiplier(
  attacker: MobilePlatform,
  targetPlatform: MobilePlatform,
): number {
  const targetRatio = getDurabilityRatio(targetPlatform);

  let multiplier =
    attacker.combatPhase === "attackRun"
      ? 1.35
      : attacker.combatPhase === "repositioning"
        ? 0.82
        : attacker.combatPhase === "evading"
          ? 0.74
          : 1;

  if (attacker.platformClass === "fighterJet") {
    multiplier *= 1.08;
  }

  if (attacker.platformClass === "drone") {
    multiplier *= 0.92;
  }

  if (targetRatio <= 0.35) {
    multiplier *= 1.18;
  }

  return multiplier;
}

function getTeamDamageMultiplier(
  attacker: MobilePlatform,
  debugSettings: DebugSettings,
): number {
  return attacker.team === "allied"
    ? debugSettings.alliedDamageMultiplier
    : debugSettings.enemyDamageMultiplier;
}

function getDeterministicRoll(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 10000) / 10000;
}

function resolveShotOutcome(
  tick: number,
  attacker: MobilePlatform,
  targetPlatform: MobilePlatform,
  weapon: Weapon,
  distance: number,
  debugSettings: DebugSettings,
): { outcome: CombatOutcome; damage: number } {
  const hitChance = computeHitChance(attacker, targetPlatform, weapon, distance);
  const hitRoll = getDeterministicRoll(
    `${tick}:${attacker.id}:${targetPlatform.id}:${weapon.id}:hit`,
  );

  if (hitRoll > hitChance) {
    return {
      outcome: "miss",
      damage: 0,
    };
  }

  const targetRatio = getDurabilityRatio(targetPlatform);
  const criticalChance = clamp(
    0.08 +
      (attacker.combatPhase === "attackRun" ? 0.08 : 0) +
      (targetRatio <= 0.4 ? 0.1 : 0),
    0.08,
    0.28,
  );
  const criticalRoll = getDeterministicRoll(
    `${tick}:${attacker.id}:${targetPlatform.id}:${weapon.id}:critical`,
  );
  const outcome: CombatOutcome =
    criticalRoll <= criticalChance ? "critical" : "hit";
  const damageMultiplier = outcome === "critical" ? 1.55 : 1;
  const damage =
    weapon.damagePerHit *
    (weapon.salvoSize ?? 1) *
    getPhaseDamageMultiplier(attacker, targetPlatform) *
    getTeamDamageMultiplier(attacker, debugSettings) *
    damageMultiplier;

  return {
    outcome,
    damage,
  };
}

function resolveObjectiveShotOutcome(
  tick: number,
  attacker: MobilePlatform,
  targetObjective: ObjectiveUnit,
  weapon: Weapon,
  debugSettings: DebugSettings,
): { outcome: CombatOutcome; damage: number } {
  const hitChance = clamp(
    weapon.accuracy *
      (weapon.probabilityOfKillBase ?? 1) *
      (0.82 + attacker.sensors.trackingQuality * 0.22),
    0.18,
    0.98,
  );
  const hitRoll = getDeterministicRoll(
    `${tick}:${attacker.id}:${targetObjective.id}:${weapon.id}:objective-hit`,
  );

  if (hitRoll > hitChance) {
    return {
      outcome: "miss",
      damage: 0,
    };
  }

  const criticalChance = clamp(
    weapon.weaponClass === "bomb" ? 0.24 : 0.12,
    0.1,
    0.26,
  );
  const criticalRoll = getDeterministicRoll(
    `${tick}:${attacker.id}:${targetObjective.id}:${weapon.id}:objective-critical`,
  );
  const outcome: CombatOutcome =
    criticalRoll <= criticalChance ? "critical" : "hit";

  return {
    outcome,
    damage:
      weapon.damagePerHit *
      (weapon.salvoSize ?? 1) *
      getTeamDamageMultiplier(attacker, debugSettings) *
      (outcome === "critical" ? 1.45 : 1),
  };
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
  debugSettings: DebugSettings,
): FireResult {
  const distance = distanceKm(attacker.position, targetPlatform.position);
  const targetType = getPlatformTargetType(targetPlatform);
  const payloadWeapon = attacker.oneWay
    ? getPrimaryPayloadWeapon(attacker, targetType) ??
      getPrimaryPayloadWeapon(attacker)
    : undefined;

  if (
    attacker.oneWay &&
    payloadWeapon &&
    distance <= payloadWeapon.maxRange
  ) {
    const impactDamage =
      getWeaponPayloadDamage(payloadWeapon) *
      1.2 *
      getTeamDamageMultiplier(attacker, debugSettings);
    const expendedAttacker = applyWeaponUse(attacker, payloadWeapon);
    const destroyedAttacker: MobilePlatform = {
      ...expendedAttacker,
      combat: {
        ...expendedAttacker.combat,
        durability: 0,
      },
      status: "destroyed",
      velocity: { x: 0, y: 0 },
      engagedWithId: undefined,
      combatPhase: undefined,
      combatPhaseTimeSeconds: 0,
      disengageReason: undefined,
    };
    const updatedTargetPlatform = applyDamageToPlatform(
      targetPlatform,
      impactDamage,
    );
    const event = createExchangeEvent(
      tick,
      destroyedAttacker,
      attacker.team === "allied" ? "allied-platform" : "enemy-platform",
      attacker.position,
      updatedTargetPlatform,
      targetPlatform.team === "allied" ? "allied-platform" : "enemy-platform",
      targetPlatform.position,
      payloadWeapon,
      impactDamage,
      {
        outcome: "critical",
      },
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
      updatedAttacker: destroyedAttacker,
      updatedTargetPlatform,
      event,
      destroyedEvent,
    };
  }

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
  const shot = resolveShotOutcome(
    tick,
    attacker,
    targetPlatform,
    weapon,
    distance,
    debugSettings,
  );
  const updatedTargetPlatform =
    shot.damage > 0
      ? applyDamageToPlatform(targetPlatform, shot.damage)
      : targetPlatform;
  const event = createExchangeEvent(
    tick,
    updatedAttacker,
    attacker.team === "allied" ? "allied-platform" : "enemy-platform",
    attacker.position,
    updatedTargetPlatform,
    targetPlatform.team === "allied" ? "allied-platform" : "enemy-platform",
    targetPlatform.position,
    weapon,
    shot.damage,
    {
      outcome: shot.outcome,
    },
  );
  const destroyedEvent =
    shot.damage > 0 && updatedTargetPlatform.combat.durability <= 0
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
    updatedAttacker: setCombatPhase(
      {
        ...updatedAttacker,
        engagedWithId: targetPlatform.id,
      },
      "repositioning",
      {
        engagedWithId: targetPlatform.id,
      },
    ),
    updatedTargetPlatform:
      shot.damage > 0 && updatedTargetPlatform.combat.durability > 0
        ? setCombatPhase(
            {
              ...updatedTargetPlatform,
              engagedWithId: attacker.id,
            },
            updatedTargetPlatform.oneWay ? "attackRun" : "evading",
            {
              engagedWithId: attacker.id,
            },
          )
        : clearCombatState(updatedTargetPlatform),
    event,
    destroyedEvent,
  };
}

function resolveObjectiveFire<T extends ObjectiveUnit>(
  tick: number,
  attacker: MobilePlatform,
  targetObjective: T,
  targetType: TargetType,
  debugSettings: DebugSettings,
): FireResult {
  const distance = distanceKm(attacker.position, targetObjective.position);
  const weapon = selectWeapon(attacker, targetType, distance);
  if (!weapon) {
    return {
      updatedAttacker: attacker,
      updatedTargetObjective: targetObjective,
    };
  }

  const updatedAttacker = applyWeaponUse(attacker, weapon);
  const shot = resolveObjectiveShotOutcome(
    tick,
    attacker,
    targetObjective,
    weapon,
    debugSettings,
  );
  const updatedTargetObjective = applyDamageToObjective(targetObjective, shot.damage);
  const event = createExchangeEvent(
    tick,
    updatedAttacker,
    attacker.team === "allied" ? "allied-platform" : "enemy-platform",
    attacker.position,
    updatedTargetObjective,
    getObjectiveCategory(updatedTargetObjective),
    targetObjective.position,
    weapon,
    shot.damage,
    {
      outcome: shot.outcome,
    },
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
  debugSettings: DebugSettings,
): { missile: MobilePlatform; city: AlliedCity; events: CombatLogEvent[] } {
  const payloadWeapon =
    getPrimaryPayloadWeapon(missile, "city") ?? getPrimaryPayloadWeapon(missile);
  const damage = payloadWeapon
    ? getWeaponPayloadDamage(payloadWeapon) *
      getTeamDamageMultiplier(missile, debugSettings)
    : 0;
  const city = applyDamageToObjective(targetCity, damage);
  const expendedMissile = payloadWeapon ? applyWeaponUse(missile, payloadWeapon) : missile;
  const destroyedMissile: MobilePlatform = {
    ...expendedMissile,
    combat: {
      ...expendedMissile.combat,
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
      payloadWeapon,
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
      const clearedPlatform = clearCombatState(alliedPlatform);
      alliedPlatform.engagedWithId = clearedPlatform.engagedWithId;
      alliedPlatform.combatPhase = clearedPlatform.combatPhase;
      alliedPlatform.combatPhaseTimeSeconds = clearedPlatform.combatPhaseTimeSeconds;
      alliedPlatform.disengageReason = clearedPlatform.disengageReason;
      if (alliedPlatform.status === "engaging") {
        alliedPlatform.status = "transit";
      }
    }
  }

  for (const enemyPlatform of enemyPlatforms) {
    if (enemyPlatform.engagedWithId && !liveAlliedIds.has(enemyPlatform.engagedWithId)) {
      const clearedPlatform = clearCombatState(enemyPlatform);
      enemyPlatform.engagedWithId = clearedPlatform.engagedWithId;
      enemyPlatform.combatPhase = clearedPlatform.combatPhase;
      enemyPlatform.combatPhaseTimeSeconds = clearedPlatform.combatPhaseTimeSeconds;
      enemyPlatform.disengageReason = clearedPlatform.disengageReason;
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
    const distance = distanceKm(enemyPlatform.position, city.position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestCity = city;
    }
  }

  return closestCity;
}

function hasCompatiblePayload(
  platform: MobilePlatform,
  targetType: TargetType,
): boolean {
  return getWeaponsForTarget(platform, targetType).length > 0;
}

function refreshEngagementPhase(
  platform: MobilePlatform,
  target: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): MobilePlatform {
  const targetType = getPlatformTargetType(target);
  const preferredRange = getPreferredCombatRange(platform, targetType);
  const distance = distanceKm(platform.position, target.position);
  const pressing = isPressingPlatform(platform, target);
  const deadlocked = isEngagementDeadlocked(
    platform,
    target,
    preferredRange,
    distance,
  );
  const mergeOrOvershoot = isMergeOrOvershoot(
    platform,
    target,
    preferredRange,
    distance,
  );
  const orbitingWithoutShot =
    !platform.oneWay &&
    platform.combatPhase === "pursuing" &&
    platform.combatPhaseTimeSeconds >= orbitTimeoutSeconds &&
    distance <= preferredRange * 1.55;

  if (platform.combatPhase === "disengaging") {
    return platform.combatPhaseTimeSeconds >= disengageWindowSeconds
      ? clearCombatState(platform)
      : platform;
  }

  if (!hasCompatiblePayload(platform, targetType)) {
    return setCombatPhase(platform, "disengaging", {
      engagedWithId: target.id,
      disengageReason: "No usable weapons remain",
    });
  }

  if (hasReachedLatestSafeRecallMoment(platform, alliedSpawnZones, enemyBases)) {
    return setCombatPhase(platform, "disengaging", {
      engagedWithId: target.id,
      disengageReason: "Breaking away while recovery fuel remains",
    });
  }

  if (
    !platform.oneWay &&
    getDurabilityRatio(platform) <= durabilityRetreatRatio
  ) {
    return setCombatPhase(platform, "disengaging", {
      engagedWithId: target.id,
      disengageReason: "Breaking away after taking heavy damage",
    });
  }

  if (
    distance >
    Math.max(
      getSensorEnvelope(platform, target) * lockLossRangeMultiplier,
      preferredRange * 2.4,
    )
  ) {
    return setCombatPhase(platform, "disengaging", {
      engagedWithId: target.id,
      disengageReason: "Target slipped outside a sustainable firing envelope",
    });
  }

  if (
    platform.combatPhase === "repositioning" &&
    platform.combatPhaseTimeSeconds >= repositionWindowSeconds
  ) {
    return setCombatPhase(platform, "pursuing", {
      engagedWithId: target.id,
    });
  }

  if (
    platform.combatPhase === "evading" &&
    platform.combatPhaseTimeSeconds >= evadeWindowSeconds
  ) {
    return setCombatPhase(platform, "pursuing", {
      engagedWithId: target.id,
    });
  }

  if (platform.oneWay) {
    return setCombatPhase(platform, "attackRun", {
      engagedWithId: target.id,
    });
  }

  if (mergeOrOvershoot) {
    return setCombatPhase(platform, pressing ? "attackRun" : "repositioning", {
      engagedWithId: target.id,
    });
  }

  if (orbitingWithoutShot) {
    return setCombatPhase(platform, pressing ? "attackRun" : "repositioning", {
      engagedWithId: target.id,
      disengageReason: pressing
        ? undefined
        : "Breaking circular pursuit to extend and recommit",
    });
  }

  if (deadlocked) {
    if (platform.combatPhase === "evading") {
      return setCombatPhase(platform, "repositioning", {
        engagedWithId: target.id,
      });
    }

    if (platform.combatPhase === "repositioning" || platform.combatPhase === "pursuing") {
      return setCombatPhase(platform, pressing ? "attackRun" : "repositioning", {
        engagedWithId: target.id,
      });
    }
  }

  const selectedWeapon = selectWeapon(platform, targetType, distance, target);
  if (
    selectedWeapon &&
    distance <= preferredRange * 1.08 &&
    (platform.combatPhase === "pursuing" ||
      platform.combatPhase === "attackRun" ||
      platform.combatPhase === undefined)
  ) {
    return setCombatPhase(platform, "attackRun", {
      engagedWithId: target.id,
    });
  }

  if (!platform.combatPhase || platform.combatPhase === "attackRun") {
    return setCombatPhase(platform, "pursuing", {
      engagedWithId: target.id,
    });
  }

  return platform;
}

export function resolveCombat(input: CombatResolutionInput): CombatResolutionResult {
  const alliedCities = input.alliedCities.map((city) => ({ ...city }));
  const alliedSpawnZones = input.alliedSpawnZones.map((spawnZone) => ({ ...spawnZone }));
  const enemyBases = input.enemyBases.map((base) => ({ ...base }));
  const alliedPlatforms = input.alliedPlatforms.map(clonePlatform);
  const enemyPlatforms = input.enemyPlatforms.map(clonePlatform);
  const detectedEnemyIds = new Set(input.detectedEnemyIds ?? []);
  const events: CombatLogEvent[] = [];

  syncActiveEngagements(alliedPlatforms, enemyPlatforms);

  for (let alliedIndex = 0; alliedIndex < alliedPlatforms.length; alliedIndex += 1) {
    const alliedPlatform = alliedPlatforms[alliedIndex];
    if (
      alliedPlatform.engagedWithId &&
      !detectedEnemyIds.has(alliedPlatform.engagedWithId)
    ) {
      alliedPlatforms[alliedIndex] = clearCombatState({
        ...alliedPlatform,
        status: alliedPlatform.status === "engaging" ? "transit" : alliedPlatform.status,
        velocity:
          alliedPlatform.status === "engaging"
            ? { x: 0, y: 0 }
            : alliedPlatform.velocity,
      });
    }
  }

  for (let enemyIndex = 0; enemyIndex < enemyPlatforms.length; enemyIndex += 1) {
    const enemyPlatform = enemyPlatforms[enemyIndex];
    if (enemyPlatform.engagedWithId && !detectedEnemyIds.has(enemyPlatform.id)) {
      enemyPlatforms[enemyIndex] = clearCombatState({
        ...enemyPlatform,
        status: enemyPlatform.status === "engaging" ? "transit" : enemyPlatform.status,
        velocity:
          enemyPlatform.status === "engaging"
            ? { x: 0, y: 0 }
            : enemyPlatform.velocity,
      });
    }
  }

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

      if (!detectedEnemyIds.has(enemyPlatform.id)) {
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

      const distance = distanceKm(alliedPlatform.position, enemyPlatform.position);
      const possibleRange = Math.max(
        getPlatformEngagementRange(
          alliedPlatform,
          getPlatformTargetType(enemyPlatform),
        ),
        getPlatformEngagementRange(
          enemyPlatform,
          getPlatformTargetType(alliedPlatform),
        ),
      );

      if (
        distance > possibleRange + impactBuffer &&
        alliedPlatform.engagedWithId !== enemyPlatform.id &&
        enemyPlatform.engagedWithId !== alliedPlatform.id
      ) {
        continue;
      }

      alliedPlatform = refreshEngagementPhase(
        setCombatPhase(alliedPlatform, alliedPlatform.combatPhase ?? "pursuing", {
          engagedWithId: enemyPlatform.id,
          preserveTimer: true,
          disengageReason: alliedPlatform.disengageReason,
        }),
        enemyPlatform,
        input.alliedSpawnZones,
        input.enemyBases,
      );
      enemyPlatform = refreshEngagementPhase(
        setCombatPhase(enemyPlatform, enemyPlatform.combatPhase ?? "pursuing", {
          engagedWithId: alliedPlatform.id,
          preserveTimer: true,
          disengageReason: enemyPlatform.disengageReason,
        }),
        alliedPlatform,
        input.alliedSpawnZones,
        input.enemyBases,
      );

      if (
        alliedPlatform.combatPhase === "disengaging" &&
        alliedPlatform.combatPhaseTimeSeconds === 0 &&
        alliedPlatform.disengageReason
      ) {
        events.push(
          createStatusEvent(
            input.tick,
            alliedPlatform,
            `${getPlatformDisplayName(alliedPlatform)} is disengaging: ${alliedPlatform.disengageReason}.`,
          ),
        );
      }

      if (
        enemyPlatform.combatPhase === "disengaging" &&
        enemyPlatform.combatPhaseTimeSeconds === 0 &&
        enemyPlatform.disengageReason
      ) {
        events.push(
          createStatusEvent(
            input.tick,
            enemyPlatform,
            `${getPlatformDisplayName(enemyPlatform)} is disengaging: ${enemyPlatform.disengageReason}.`,
          ),
        );
      }

      if (
        alliedPlatform.combatPhase === "disengaging" &&
        enemyPlatform.combatPhase === "disengaging"
      ) {
        alliedPlatforms[alliedIndex] = alliedPlatform;
        enemyPlatforms[enemyIndex] = enemyPlatform;
        break;
      }

      const alliedHadAttackRun =
        alliedPlatform.combatPhase === "attackRun" &&
        alliedPlatform.combatPhaseTimeSeconds <= attackRunWindowSeconds;
      const enemyHadAttackRun =
        enemyPlatform.combatPhase === "attackRun" &&
        enemyPlatform.combatPhaseTimeSeconds <= attackRunWindowSeconds;
      const alliedCanResolveFire = alliedPlatform.oneWay || alliedHadAttackRun;
      const enemyCanResolveFire = enemyPlatform.oneWay || enemyHadAttackRun;

      if (alliedCanResolveFire) {
        const alliedFire = resolvePlatformFire(
          input.tick,
          alliedPlatform,
          enemyPlatform,
          input.debugSettings,
        );
        alliedPlatform = alliedFire.updatedAttacker;
        enemyPlatform = alliedFire.updatedTargetPlatform ?? enemyPlatform;
        if (alliedFire.event) {
          events.push(alliedFire.event);
        }
        if (alliedFire.destroyedEvent) {
          events.push(alliedFire.destroyedEvent);
        }
      }

      if (
        !isPlatformDestroyed(enemyPlatform) &&
        !isPlatformDestroyed(alliedPlatform) &&
        enemyCanResolveFire
      ) {
        const enemyFire = resolvePlatformFire(
          input.tick,
          enemyPlatform,
          alliedPlatform,
          input.debugSettings,
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

      if (
        alliedPlatform.engagedWithId === enemyPlatform.id ||
        enemyPlatform.engagedWithId === alliedPlatform.id
      ) {
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

    const distanceToCity = distanceKm(enemyPlatform.position, targetCity.position);
    const payloadWeapon =
      enemyPlatform.oneWay
        ? getPrimaryPayloadWeapon(enemyPlatform, "city") ??
          getPrimaryPayloadWeapon(enemyPlatform)
        : undefined;
    if (
      enemyPlatform.platformClass === "ballisticMissile" &&
      payloadWeapon &&
      distanceToCity <= payloadWeapon.maxRange
    ) {
      const impact = resolveMissileImpact(
        input.tick,
        enemyPlatform,
        targetCity,
        input.debugSettings,
      );
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
      input.debugSettings,
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
