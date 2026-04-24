import type { MobilePlatform } from "../../models/entity";

export function getPlatformTransitSpeed(platform: MobilePlatform): number {
  const maneuverBonus = platform.acceleration * 0.08;
  const durabilityRatio =
    platform.combat.durability / Math.max(1, platform.combat.maxDurability);
  const performanceFactor =
    durabilityRatio >= 0.72
      ? 1
      : Math.max(0.72, 0.62 + durabilityRatio * 0.38);

  return Math.min(
    platform.maxSpeed * performanceFactor,
    (platform.cruiseSpeed + maneuverBonus) * performanceFactor,
  );
}
