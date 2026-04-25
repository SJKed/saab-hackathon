import type {
  AlliedCity,
  AlliedSpawnZone,
  MobilePlatform,
  SensorProfile,
  TargetType,
  Vector,
} from "../models/entity";
import {
  getPlatformDisplayName,
  getPlatformTargetType,
  isPlatformDeployed,
  platformCanSenseTarget,
} from "../models/platform-utils";
import { distanceKm, kmToRaw } from "../models/distance";
import { getSensorEnvelope } from "./intercept";

export type DetectionSourceKind = "fixed-radar" | "platform-sensor";

export type DetectionSource = {
  id: string;
  name: string;
  kind: DetectionSourceKind;
  position: Vector;
  sensorRangeKm: number;
};

export type LastKnownEnemyContact = {
  enemyId: string;
  enemyName: string;
  platformClass: MobilePlatform["platformClass"];
  position: Vector;
  velocity: Vector;
  lastDetectedTick: number;
  detectedBy: string;
  staleTicks: number;
};

export type DetectionState = {
  detectedEnemyIds: string[];
  lastKnownEnemyContacts: LastKnownEnemyContact[];
  detectionSources: DetectionSource[];
};

const fixedRadarProfile: SensorProfile = {
  sensorRange: 300,
  sensorType: "radar",
  trackingQuality: 0.78,
  targetTypesSupported: ["fighterJet", "drone", "ballisticMissile"],
  jamResistance: 0.82,
};

function cloneVector(vector: Vector): Vector {
  return {
    x: vector.x,
    y: vector.y,
  };
}

function fixedRadarCanSenseTarget(targetType: TargetType): boolean {
  return fixedRadarProfile.targetTypesSupported.includes(targetType);
}

function getFixedRadarEnvelope(enemyPlatform: MobilePlatform): number {
  const targetSignatureModifier =
    0.82 + enemyPlatform.combat.signature * 0.42;
  const trackingModifier = 0.9 + fixedRadarProfile.trackingQuality * 0.28;

  return fixedRadarProfile.sensorRange * targetSignatureModifier * trackingModifier;
}

function isEligibleAirborneDetector(platform: MobilePlatform): boolean {
  return (
    platform.team === "allied" &&
    isPlatformDeployed(platform) &&
    (platform.role === "recon" || platform.sensors.sensorType === "radar")
  );
}

function getFixedRadarSources(
  alliedCities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
): DetectionSource[] {
  return [
    ...alliedCities.map((city) => ({
      id: `fixed-radar:${city.id}`,
      name: `${city.name ?? city.id} radar`,
      kind: "fixed-radar" as const,
      position: cloneVector(city.position),
      sensorRangeKm: fixedRadarProfile.sensorRange,
    })),
    ...alliedSpawnZones.map((spawnZone) => ({
      id: `fixed-radar:${spawnZone.id}`,
      name: `${spawnZone.name ?? spawnZone.id} radar`,
      kind: "fixed-radar" as const,
      position: cloneVector(spawnZone.position),
      sensorRangeKm: fixedRadarProfile.sensorRange,
    })),
  ];
}

function getPlatformSensorSources(
  alliedPlatforms: MobilePlatform[],
): DetectionSource[] {
  return alliedPlatforms.filter(isEligibleAirborneDetector).map((platform) => ({
    id: `platform-sensor:${platform.id}`,
    name: `${getPlatformDisplayName(platform)} ${platform.sensors.sensorType}`,
    kind: "platform-sensor",
    position: cloneVector(platform.position),
    sensorRangeKm: platform.sensors.sensorRange,
  }));
}

function detectWithFixedRadar(
  enemyPlatform: MobilePlatform,
  alliedCities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
): string | undefined {
  const targetType = getPlatformTargetType(enemyPlatform);
  if (!fixedRadarCanSenseTarget(targetType)) {
    return undefined;
  }

  const envelope = getFixedRadarEnvelope(enemyPlatform);
  const fixedObjectives = [...alliedCities, ...alliedSpawnZones];

  for (const objective of fixedObjectives) {
    if (distanceKm(objective.position, enemyPlatform.position) <= envelope) {
      return `${objective.name ?? objective.id} radar`;
    }
  }

  return undefined;
}

function detectWithPlatformSensor(
  enemyPlatform: MobilePlatform,
  alliedPlatforms: MobilePlatform[],
): string | undefined {
  const targetType = getPlatformTargetType(enemyPlatform);

  for (const alliedPlatform of alliedPlatforms) {
    if (
      !isEligibleAirborneDetector(alliedPlatform) ||
      !platformCanSenseTarget(alliedPlatform, targetType)
    ) {
      continue;
    }

    if (
      distanceKm(alliedPlatform.position, enemyPlatform.position) <=
      getSensorEnvelope(alliedPlatform, enemyPlatform)
    ) {
      return getPlatformDisplayName(alliedPlatform);
    }
  }

  return undefined;
}

export function getDetectionSourceRadiusRaw(source: DetectionSource): number {
  return kmToRaw(source.sensorRangeKm);
}

export function createDetectionState(): DetectionState {
  return {
    detectedEnemyIds: [],
    lastKnownEnemyContacts: [],
    detectionSources: [],
  };
}

export function calculateDetectionState(input: {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  previousState: DetectionState;
  tick: number;
}): DetectionState {
  const detectedEnemyIds: string[] = [];
  const previousContactsById = new Map(
    input.previousState.lastKnownEnemyContacts.map((contact) => [
      contact.enemyId,
      contact,
    ]),
  );
  const nextContactsById = new Map<string, LastKnownEnemyContact>();

  for (const enemyPlatform of input.enemyPlatforms) {
    if (!isPlatformDeployed(enemyPlatform)) {
      continue;
    }

    const detectedBy =
      detectWithFixedRadar(
        enemyPlatform,
        input.alliedCities,
        input.alliedSpawnZones,
      ) ?? detectWithPlatformSensor(enemyPlatform, input.alliedPlatforms);

    if (detectedBy) {
      detectedEnemyIds.push(enemyPlatform.id);
      nextContactsById.set(enemyPlatform.id, {
        enemyId: enemyPlatform.id,
        enemyName: getPlatformDisplayName(enemyPlatform),
        platformClass: enemyPlatform.platformClass,
        position: cloneVector(enemyPlatform.position),
        velocity: cloneVector(enemyPlatform.velocity),
        lastDetectedTick: input.tick,
        detectedBy,
        staleTicks: 0,
      });
      continue;
    }

    const previousContact = previousContactsById.get(enemyPlatform.id);
    if (previousContact) {
      nextContactsById.set(enemyPlatform.id, {
        ...previousContact,
        position: cloneVector(previousContact.position),
        velocity: cloneVector(previousContact.velocity),
        staleTicks: Math.max(0, input.tick - previousContact.lastDetectedTick),
      });
    }
  }

  return {
    detectedEnemyIds,
    lastKnownEnemyContacts: [...nextContactsById.values()],
    detectionSources: [
      ...getFixedRadarSources(input.alliedCities, input.alliedSpawnZones),
      ...getPlatformSensorSources(input.alliedPlatforms),
    ],
  };
}

export function getDetectedEnemyPlatforms(
  enemyPlatforms: MobilePlatform[],
  detectionState: DetectionState,
): MobilePlatform[] {
  const detectedEnemyIds = new Set(detectionState.detectedEnemyIds);

  return enemyPlatforms.filter((enemyPlatform) =>
    detectedEnemyIds.has(enemyPlatform.id),
  );
}
