import type { MobilePlatform } from "../../models/entity";

export function getSensorEnvelope(
  platform: MobilePlatform,
  target: MobilePlatform,
): number {
  const targetSignatureModifier = 0.82 + target.combat.signature * 0.42;
  const trackingModifier = 0.9 + platform.sensors.trackingQuality * 0.28;

  return platform.sensors.sensorRange * targetSignatureModifier * trackingModifier;
}
