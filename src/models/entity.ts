export type Team = "allied" | "enemy";
export type PlatformClass = "fighterJet" | "drone" | "ballisticMissile";
export type WeaponClass =
  | "rapidFire"
  | "airToAirMissile"
  | "bomb"
  | "surfaceToAirMissile"
  | "terminalPayload";
export type GuidanceType = "unguided" | "radar" | "infrared" | "command";
export type SensorType = "radar" | "electroOptical" | "infrared" | "passive";
export type UnitStatus =
  | "stored"
  | "idle"
  | "launching"
  | "transit"
  | "intercepting"
  | "engaging"
  | "reinforcing"
  | "returning"
  | "destroyed";
export type CombatPhase =
  | "pursuing"
  | "attackRun"
  | "evading"
  | "repositioning"
  | "disengaging";
export type TargetType =
  | PlatformClass
  | "city"
  | "spawnZone"
  | "base"
  | "radarStation";
export type PlatformRole = "interceptor" | "strike" | "recon" | "patrol";

export interface Vector {
  x: number;
  y: number;
}

export interface StaticObjective {
  id: string;
  name?: string;
  position: Vector;
  maxHealth: number;
  health: number;
  defenseRating: number;
  missileAmmunition?: number;
  missileMaxAmmunition?: number;
}

export interface AlliedCity extends StaticObjective {
  value: number;
  threat: number;
}

export interface AlliedSpawnZone extends StaticObjective {}

export interface EnemyBase extends StaticObjective {}

export interface AlliedRadarStation extends StaticObjective {
  value: number;
  isSensorActive: boolean;
}

export interface SensorProfile {
  sensorRange: number;
  sensorType: SensorType;
  trackingQuality: number;
  targetTypesSupported: TargetType[];
  jamResistance: number;
}

export interface Weapon {
  id: string;
  name: string;
  weaponClass: WeaponClass;
  ammunition: number;
  maxAmmunition: number;
  damagePerHit: number;
  rateOfFire: number;
  reloadTime: number;
  cooldown: number;
  minRange: number;
  effectiveRange: number;
  maxRange: number;
  accuracy: number;
  guidanceType: GuidanceType;
  targetTypesSupported: TargetType[];
  blastRadius?: number;
  salvoSize?: number;
  probabilityOfKillBase?: number;
}

export interface PlatformCombatProfile {
  durability: number;
  maxDurability: number;
  evasion: number;
  signature: number;
  armor: number;
}

export interface MobilePlatform {
  id: string;
  name?: string;
  team: Team;
  platformClass: PlatformClass;
  role: PlatformRole;
  position: Vector;
  velocity: Vector;
  status: UnitStatus;
  threatLevel: number;
  maxSpeed: number;
  cruiseSpeed: number;
  acceleration: number;
  enduranceSeconds: number;
  maxEnduranceSeconds: number;
  oneWay: boolean;
  deploymentDelaySeconds: number;
  engagedWithId?: string;
  combatPhase?: CombatPhase;
  combatPhaseTimeSeconds: number;
  disengageReason?: string;
  originId?: string;
  targetId?: string;
  combat: PlatformCombatProfile;
  sensors: SensorProfile;
  weapons: Weapon[];
  interceptDifficulty?: number;
}

export type VectorModel = Vector;
export type AlliedCityModel = AlliedCity;
export type AlliedSpawnZoneModel = AlliedSpawnZone;
export type EnemyBaseModel = EnemyBase;
export type MobilePlatformModel = MobilePlatform;
export type WeaponModel = Weapon;
