import type {
  MobilePlatform,
  TargetType,
  Vector,
  Weapon,
} from "./entity";

const epsilon = 0.000001;

export function distanceBetween(a: Vector, b: Vector): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function cloneWeapon(weapon: Weapon): Weapon {
  return {
    ...weapon,
    targetTypesSupported: [...weapon.targetTypesSupported],
  };
}

export function clonePlatform(platform: MobilePlatform): MobilePlatform {
  return {
    ...platform,
    position: { ...platform.position },
    velocity: { ...platform.velocity },
    combat: { ...platform.combat },
    sensors: {
      ...platform.sensors,
      targetTypesSupported: [...platform.sensors.targetTypesSupported],
    },
    weapons: platform.weapons.map(cloneWeapon),
  };
}

export function getPlatformTargetType(platform: MobilePlatform): TargetType {
  return platform.platformClass;
}

export function isPlatformDestroyed(platform: MobilePlatform): boolean {
  return (
    platform.status === "destroyed" ||
    platform.combat.durability <= epsilon
  );
}

export function isPlatformStored(platform: MobilePlatform): boolean {
  return platform.status === "stored";
}

export function isPlatformDeployed(platform: MobilePlatform): boolean {
  return !isPlatformDestroyed(platform) && !isPlatformStored(platform);
}

export function getWeaponShotInterval(weapon: Weapon): number {
  const fireInterval = weapon.rateOfFire > epsilon ? 1 / weapon.rateOfFire : 0;
  return Math.max(fireInterval, weapon.reloadTime);
}

export function getUsableAmmoCost(weapon: Weapon): number {
  return Math.max(1, weapon.salvoSize ?? 1);
}

export function getWeaponsForTarget(
  platform: MobilePlatform,
  targetType: TargetType,
): Weapon[] {
  return platform.weapons.filter(
    (weapon) =>
      weaponSupportsTarget(weapon, targetType) &&
      weapon.ammunition >= getUsableAmmoCost(weapon),
  );
}

export function weaponSupportsTarget(weapon: Weapon, targetType: TargetType): boolean {
  return weapon.targetTypesSupported.includes(targetType);
}

export function platformCanSenseTarget(
  platform: MobilePlatform,
  targetType: TargetType,
): boolean {
  return platform.sensors.targetTypesSupported.includes(targetType);
}

export function getPlatformDisplayName(
  unit: { id: string; name?: string },
): string {
  return unit.name ?? unit.id;
}

export function getPreferredCombatRange(
  platform: MobilePlatform,
  targetType: TargetType,
): number {
  if (platform.oneWay) {
    return Math.max(12, (platform.impactRadius ?? 18) * 1.1);
  }

  const usableWeapons = getWeaponsForTarget(platform, targetType);
  if (usableWeapons.length === 0) {
    return platform.platformClass === "ballisticMissile" ? 18 : 32;
  }

  const preferredWeapon = usableWeapons.reduce((bestWeapon, weapon) =>
    weapon.effectiveRange > bestWeapon.effectiveRange ? weapon : bestWeapon,
  );

  switch (preferredWeapon.weaponClass) {
    case "airToAirMissile":
      return Math.max(36, preferredWeapon.effectiveRange * 0.82);
    case "rapidFire":
      return Math.max(18, preferredWeapon.effectiveRange * 0.58);
    case "bomb":
      return Math.max(12, preferredWeapon.effectiveRange * 0.55);
    case "surfaceToAirMissile":
      return Math.max(44, preferredWeapon.effectiveRange * 0.8);
    default:
      return Math.max(20, preferredWeapon.effectiveRange * 0.7);
  }
}
