import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  PlatformClass,
  PlatformCombatProfile,
  PlatformRole,
  SensorProfile,
  Weapon,
  WeaponClass,
} from "../models/entity";
import { ENEMY_DEPLOYMENT_HOLD_SECONDS } from "../models/platform-constants";

type WeaponTemplate = Omit<Weapon, "id" | "cooldown" | "ammunition">;

type PlatformTemplate = {
  label: string;
  platformClass: PlatformClass;
  role: PlatformRole;
  threatLevel: number;
  maxSpeed: number;
  cruiseSpeed: number;
  acceleration: number;
  maxEnduranceSeconds: number;
  combat: Omit<PlatformCombatProfile, "durability">;
  sensors: SensorProfile;
  weapons: WeaponTemplate[];
  oneWay?: boolean;
  warheadDamage?: number;
  impactRadius?: number;
  interceptDifficulty?: number;
};

type PlatformInventory = Record<PlatformClass, number>;

const rapidFireTemplate = (
  name: string,
  maxAmmunition: number,
  damagePerHit: number,
  accuracy: number,
  maxRange: number,
  targetTypesSupported: Weapon["targetTypesSupported"],
): WeaponTemplate => ({
  name,
  weaponClass: "rapidFire",
  maxAmmunition,
  damagePerHit,
  rateOfFire: 2.5,
  reloadTime: 0.8,
  minRange: 0,
  effectiveRange: maxRange * 0.72,
  maxRange,
  accuracy,
  guidanceType: "unguided",
  targetTypesSupported,
  probabilityOfKillBase: accuracy,
});

const airToAirMissileTemplate = (
  maxAmmunition: number,
  targetTypesSupported: Weapon["targetTypesSupported"],
): WeaponTemplate => ({
  name: "A2A Missile Rack",
  weaponClass: "airToAirMissile",
  maxAmmunition,
  damagePerHit: 34,
  rateOfFire: 0.8,
  reloadTime: 2.8,
  minRange: 28,
  effectiveRange: 118,
  maxRange: 142,
  accuracy: 0.84,
  guidanceType: "radar",
  targetTypesSupported,
  salvoSize: 1,
  probabilityOfKillBase: 0.82,
});

const bombTemplate = (
  name: string,
  maxAmmunition: number,
  damagePerHit: number,
  maxRange: number,
): WeaponTemplate => ({
  name,
  weaponClass: "bomb",
  maxAmmunition,
  damagePerHit,
  rateOfFire: 0.45,
  reloadTime: 3.5,
  minRange: 0,
  effectiveRange: maxRange * 0.85,
  maxRange,
  accuracy: 0.78,
  guidanceType: "infrared",
  targetTypesSupported: ["city", "spawnZone", "base"],
  blastRadius: 18,
  salvoSize: 1,
  probabilityOfKillBase: 0.8,
});

const alliedFighterTemplate: PlatformTemplate = {
  label: "Fighter Jet",
  platformClass: "fighterJet",
  role: "interceptor",
  threatLevel: 0.45,
  maxSpeed: 1050,
  cruiseSpeed: 860,
  acceleration: 620,
  maxEnduranceSeconds: 110,
  combat: {
    maxDurability: 130,
    evasion: 0.74,
    signature: 0.48,
    armor: 0.2,
  },
  sensors: {
    sensorRange: 220,
    sensorType: "radar",
    trackingQuality: 0.88,
    targetTypesSupported: ["fighterJet", "drone", "ballisticMissile"],
    jamResistance: 0.8,
  },
  weapons: [
    rapidFireTemplate(
      "Autocannon",
      26,
      11,
      0.74,
      54,
      ["fighterJet", "drone"],
    ),
    airToAirMissileTemplate(4, ["fighterJet", "drone", "ballisticMissile"]),
  ],
};

const alliedDroneTemplate: PlatformTemplate = {
  label: "Defense Drone",
  platformClass: "drone",
  role: "patrol",
  threatLevel: 0.35,
  maxSpeed: 560,
  cruiseSpeed: 430,
  acceleration: 260,
  maxEnduranceSeconds: 156,
  combat: {
    maxDurability: 82,
    evasion: 0.58,
    signature: 0.32,
    armor: 0.08,
  },
  sensors: {
    sensorRange: 172,
    sensorType: "infrared",
    trackingQuality: 0.72,
    targetTypesSupported: ["fighterJet", "drone", "ballisticMissile"],
    jamResistance: 0.55,
  },
  weapons: [
    rapidFireTemplate(
      "Stabilized Gun Pod",
      18,
      8,
      0.68,
      42,
      ["drone", "ballisticMissile"],
    ),
    airToAirMissileTemplate(2, ["drone", "ballisticMissile"]),
  ],
};

const alliedBallisticMissileTemplate: PlatformTemplate = {
  label: "Interceptor Missile",
  platformClass: "ballisticMissile",
  role: "interceptor",
  threatLevel: 0.42,
  maxSpeed: 1250,
  cruiseSpeed: 1250,
  acceleration: 980,
  maxEnduranceSeconds: 68,
  combat: {
    maxDurability: 58,
    evasion: 0.2,
    signature: 0.18,
    armor: 0.05,
  },
  sensors: {
    sensorRange: 144,
    sensorType: "passive",
    trackingQuality: 0.66,
    targetTypesSupported: ["fighterJet", "drone", "ballisticMissile"],
    jamResistance: 0.7,
  },
  weapons: [],
  oneWay: true,
  warheadDamage: 110,
  impactRadius: 18,
  interceptDifficulty: 0.68,
};

const enemyFighterTemplate: PlatformTemplate = {
  label: "Strike Fighter",
  platformClass: "fighterJet",
  role: "strike",
  threatLevel: 0.86,
  maxSpeed: 980,
  cruiseSpeed: 780,
  acceleration: 560,
  maxEnduranceSeconds: 128,
  combat: {
    maxDurability: 124,
    evasion: 0.66,
    signature: 0.54,
    armor: 0.18,
  },
  sensors: {
    sensorRange: 204,
    sensorType: "radar",
    trackingQuality: 0.81,
    targetTypesSupported: [
      "fighterJet",
      "drone",
      "ballisticMissile",
      "city",
      "spawnZone",
      "base",
    ],
    jamResistance: 0.74,
  },
  weapons: [
    rapidFireTemplate(
      "Forward Cannon",
      24,
      10,
      0.7,
      48,
      ["fighterJet", "drone"],
    ),
    bombTemplate("Strike Bomb Bay", 2, 46, 24),
  ],
};

const enemyDroneTemplate: PlatformTemplate = {
  label: "Recon Drone",
  platformClass: "drone",
  role: "recon",
  threatLevel: 0.52,
  maxSpeed: 520,
  cruiseSpeed: 390,
  acceleration: 230,
  maxEnduranceSeconds: 164,
  combat: {
    maxDurability: 74,
    evasion: 0.62,
    signature: 0.28,
    armor: 0.04,
  },
  sensors: {
    sensorRange: 178,
    sensorType: "electroOptical",
    trackingQuality: 0.69,
    targetTypesSupported: [
      "fighterJet",
      "drone",
      "ballisticMissile",
      "city",
      "spawnZone",
      "base",
    ],
    jamResistance: 0.46,
  },
  weapons: [
    rapidFireTemplate(
      "Light Gun Mount",
      16,
      7,
      0.64,
      40,
      ["drone"],
    ),
    bombTemplate("Guided Charge", 1, 34, 18),
  ],
};

const enemyBallisticMissileTemplate: PlatformTemplate = {
  label: "Ballistic Missile",
  platformClass: "ballisticMissile",
  role: "strike",
  threatLevel: 1.08,
  maxSpeed: 1180,
  cruiseSpeed: 1180,
  acceleration: 940,
  maxEnduranceSeconds: 70,
  combat: {
    maxDurability: 62,
    evasion: 0.24,
    signature: 0.2,
    armor: 0.06,
  },
  sensors: {
    sensorRange: 136,
    sensorType: "passive",
    trackingQuality: 0.62,
    targetTypesSupported: ["city", "spawnZone", "base"],
    jamResistance: 0.72,
  },
  weapons: [],
  oneWay: true,
  warheadDamage: 118,
  impactRadius: 20,
  interceptDifficulty: 0.74,
};

const targetInventoryPerBase: PlatformInventory = {
  fighterJet: 2,
  drone: 5,
  ballisticMissile: 4,
};

const inventoryVariance = 1;
const alliedPlatformTemplates: Record<PlatformClass, PlatformTemplate> = {
  fighterJet: alliedFighterTemplate,
  drone: alliedDroneTemplate,
  ballisticMissile: alliedBallisticMissileTemplate,
};

const enemyPlatformTemplates: Record<PlatformClass, PlatformTemplate> = {
  fighterJet: enemyFighterTemplate,
  drone: enemyDroneTemplate,
  ballisticMissile: enemyBallisticMissileTemplate,
};

function createWeapons(platformId: string, templates: WeaponTemplate[]): Weapon[] {
  return templates.map((template, index) => ({
    ...template,
    id: `${platformId}-weapon-${index + 1}`,
    ammunition: template.maxAmmunition,
    cooldown: 0,
    targetTypesSupported: [...template.targetTypesSupported],
  }));
}

function createPlatform(
  id: string,
  name: string,
  template: PlatformTemplate,
  position: { x: number; y: number },
  originId: string,
  team: MobilePlatform["team"],
  deploymentDelaySeconds: number,
  targetId?: string,
): MobilePlatform {
  return {
    id,
    name,
    team,
    platformClass: template.platformClass,
    role: template.role,
    position,
    velocity: { x: 0, y: 0 },
    status: "stored",
    threatLevel: template.threatLevel,
    maxSpeed: template.maxSpeed,
    cruiseSpeed: template.cruiseSpeed,
    acceleration: template.acceleration,
    enduranceSeconds: template.maxEnduranceSeconds,
    maxEnduranceSeconds: template.maxEnduranceSeconds,
    oneWay: template.oneWay ?? false,
    deploymentDelaySeconds,
    originId,
    targetId,
    combatPhaseTimeSeconds: 0,
    combat: {
      ...template.combat,
      durability: template.combat.maxDurability,
    },
    sensors: {
      ...template.sensors,
      targetTypesSupported: [...template.sensors.targetTypesSupported],
    },
    weapons: createWeapons(id, template.weapons),
    warheadDamage: template.warheadDamage,
    impactRadius: template.impactRadius,
    interceptDifficulty: template.interceptDifficulty,
  };
}

function withOffset(
  position: { x: number; y: number },
  angle: number,
  radius: number,
): { x: number; y: number } {
  return {
    x: position.x + Math.cos(angle) * radius,
    y: position.y + Math.sin(angle) * radius,
  };
}

function randomVariance(): number {
  return Math.floor(Math.random() * ((inventoryVariance * 2) + 1)) - inventoryVariance;
}

function rollInventoryForBase(): PlatformInventory {
  return {
    fighterJet: targetInventoryPerBase.fighterJet + randomVariance(),
    drone: targetInventoryPerBase.drone + randomVariance(),
    ballisticMissile: targetInventoryPerBase.ballisticMissile + randomVariance(),
  };
}

function getSpawnPattern(
  platformClass: PlatformClass,
  baseIndex: number,
  instanceIndex: number,
): { angle: number; radius: number } {
  const classAngleSeed =
    platformClass === "fighterJet"
      ? -0.7
      : platformClass === "drone"
        ? 0.95
        : 2.25;
  const classRadiusSeed =
    platformClass === "fighterJet"
      ? 12
      : platformClass === "drone"
        ? 20
        : 28;

  return {
    angle: classAngleSeed + (baseIndex * 0.37) + (instanceIndex * 0.68),
    radius: classRadiusSeed + (Math.floor(instanceIndex / 4) * 11) + ((instanceIndex % 4) * 2),
  };
}

function getInitialDeploymentDelaySeconds(
  team: MobilePlatform["team"],
  _platformClass: PlatformClass,
  _baseIndex: number,
  _instanceIndex: number,
): number {
  if (team === "allied") {
    return 0;
  }

  return ENEMY_DEPLOYMENT_HOLD_SECONDS;
}

function createPlatformsForBase(
  base: AlliedSpawnZone | EnemyBase,
  baseIndex: number,
  inventory: PlatformInventory,
  templates: Record<PlatformClass, PlatformTemplate>,
  team: MobilePlatform["team"],
  targetCityIds: string[],
): MobilePlatform[] {
  const platformClasses: PlatformClass[] = [
    "fighterJet",
    "drone",
    "ballisticMissile",
  ];

  return platformClasses.flatMap((platformClass, classIndex) => {
    const template = templates[platformClass];
    const count = inventory[platformClass];

    return Array.from({ length: count }, (_, instanceIndex) => {
      const spawnPattern = getSpawnPattern(platformClass, baseIndex, instanceIndex);
      const position = withOffset(
        base.position,
        spawnPattern.angle,
        spawnPattern.radius,
      );
      const platformId =
        `${team === "allied" ? "A" : "E"}-${base.id}-${platformClass}-${instanceIndex + 1}`;
      const targetId =
        team === "enemy" && targetCityIds.length > 0
          ? targetCityIds[(baseIndex + classIndex + instanceIndex) % targetCityIds.length]
          : undefined;
      const deploymentDelaySeconds = getInitialDeploymentDelaySeconds(
        team,
        platformClass,
        baseIndex,
        instanceIndex,
      );

      return createPlatform(
        platformId,
        `${base.name ?? base.id} ${template.label} ${instanceIndex + 1}`,
        template,
        position,
        base.id,
        team,
        deploymentDelaySeconds,
        targetId,
      );
    });
  });
}

export function createAlliedPlatforms(
  spawnZones: AlliedSpawnZone[],
): MobilePlatform[] {
  return spawnZones.flatMap((spawnZone, spawnZoneIndex) =>
    createPlatformsForBase(
      spawnZone,
      spawnZoneIndex,
      rollInventoryForBase(),
      alliedPlatformTemplates,
      "allied",
      [],
    ),
  );
}

export function createEnemyPlatforms(
  enemyBases: EnemyBase[],
  alliedCities: AlliedCity[],
): MobilePlatform[] {
  if (alliedCities.length === 0) {
    return [];
  }

  return enemyBases.flatMap((enemyBase, enemyBaseIndex) =>
    createPlatformsForBase(
      enemyBase,
      enemyBaseIndex,
      rollInventoryForBase(),
      enemyPlatformTemplates,
      "enemy",
      alliedCities.map((city) => city.id),
    ),
  );
}

export function getWeaponClassLabel(weaponClass: WeaponClass): string {
  switch (weaponClass) {
    case "rapidFire":
      return "Rapid Fire";
    case "airToAirMissile":
      return "A2A Missile";
    case "bomb":
      return "Bomb";
    case "surfaceToAirMissile":
      return "SAM";
    default:
      return weaponClass;
  }
}
