import type {
  AlliedCity,
  AlliedRadarStation,
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
import {
  distanceWorld,
  pixelToWorldDistance,
  worldToPixelDistance,
} from "../models/distance";
import { getSensorEnvelope } from "./intercept";

export type DetectionSourceKind = "fixed-radar" | "platform-sensor" | "passive-sensor";

export type DetectionSource = {
  id: string;
  name: string;
  kind: DetectionSourceKind;
  position: Vector;
  sensorRangeWorld: number;
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
  confidence?: number;
  trackingQuality?: number;
};

export type DetectionState = {
  detectedEnemyIds: string[];
  lastKnownEnemyContacts: LastKnownEnemyContact[];
  detectionSources: DetectionSource[];
};

const fixedRadarProfile: SensorProfile = {
  sensorRange: pixelToWorldDistance(300),
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
    (platform.role === "recon" ||
      platform.sensors.sensorType === "radar" ||
      platform.sensors.sensorType === "passive")
  );
}

function getFixedRadarSources(
  alliedCities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  alliedRadarStations: AlliedRadarStation[],
): DetectionSource[] {
  return [
    ...alliedCities.map((city) => ({
        id: `fixed-radar:${city.id}`,
        name: `${city.name ?? city.id} radar`,
        kind: "fixed-radar" as const,
        position: cloneVector(city.position),
        sensorRangeWorld: fixedRadarProfile.sensorRange,
      })),
    ...alliedSpawnZones.map((spawnZone) => ({
        id: `fixed-radar:${spawnZone.id}`,
        name: `${spawnZone.name ?? spawnZone.id} radar`,
        kind: "fixed-radar" as const,
        position: cloneVector(spawnZone.position),
        sensorRangeWorld: fixedRadarProfile.sensorRange,
      })),
    ...alliedRadarStations
      .filter((station) => station.health > 0 && station.isSensorActive)
      .map((station) => ({
        id: `fixed-radar:${station.id}`,
        name: `${station.name ?? station.id} radar`,
        kind: "fixed-radar" as const,
        position: cloneVector(station.position),
        sensorRangeWorld: fixedRadarProfile.sensorRange,
      })),
  ];
}

function getPlatformSensorSources(
  alliedPlatforms: MobilePlatform[],
): DetectionSource[] {
  return alliedPlatforms.filter(isEligibleAirborneDetector).map((platform) => ({
    id: `platform-sensor:${platform.id}`,
    name: `${getPlatformDisplayName(platform)} ${platform.sensors.sensorType}`,
    kind:
      platform.sensors.sensorType === "passive"
        ? "passive-sensor"
        : "platform-sensor",
    position: cloneVector(platform.position),
    sensorRangeWorld: platform.sensors.sensorRange,
  }));
}

function enemyEmitsRadar(enemyPlatform: MobilePlatform): boolean {
  return enemyPlatform.sensors.sensorType === "radar" && isPlatformDeployed(enemyPlatform);
}

function detectWithFixedRadar(
  enemyPlatform: MobilePlatform,
  alliedCities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  alliedRadarStations: AlliedRadarStation[],
): string | undefined {
  const targetType = getPlatformTargetType(enemyPlatform);
  if (!fixedRadarCanSenseTarget(targetType)) {
    return undefined;
  }

  const envelope = getFixedRadarEnvelope(enemyPlatform);
  const fixedObjectives = [...alliedCities, ...alliedSpawnZones, ...alliedRadarStations];

  for (const objective of fixedObjectives) {
    if (distanceWorld(objective.position, enemyPlatform.position) <= envelope) {
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
    if (alliedPlatform.sensors.sensorType === "passive" && !enemyEmitsRadar(enemyPlatform)) {
      continue;
    }

    if (
      distanceWorld(alliedPlatform.position, enemyPlatform.position) <=
      getSensorEnvelope(alliedPlatform, enemyPlatform)
    ) {
      return alliedPlatform.sensors.sensorType === "passive"
        ? `${getPlatformDisplayName(alliedPlatform)} passive intercept`
        : getPlatformDisplayName(alliedPlatform);
    }
  }

  return undefined;
}

export function getDetectionSourceRadiusRaw(source: DetectionSource): number {
  return worldToPixelDistance(source.sensorRangeWorld);
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
  alliedRadarStations?: AlliedRadarStation[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  previousState: DetectionState;
  tick: number;
}): DetectionState {
  const alliedRadarStations = input.alliedRadarStations ?? [];
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
        alliedRadarStations,
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
        confidence: 1,
        trackingQuality: 1,
      });
      continue;
    }

    const previousContact = previousContactsById.get(enemyPlatform.id);
    if (previousContact) {
      const staleTicks = Math.max(0, input.tick - previousContact.lastDetectedTick);
      const confidence = Math.max(
        0.05,
        (previousContact.confidence ?? 1) * Math.pow(0.9, staleTicks),
      );
      if (confidence >= 0.35) {
        detectedEnemyIds.push(enemyPlatform.id);
      }
      nextContactsById.set(enemyPlatform.id, {
        ...previousContact,
        position: cloneVector(previousContact.position),
        velocity: cloneVector(previousContact.velocity),
        staleTicks,
        confidence,
        trackingQuality: previousContact.trackingQuality ?? 1,
      });
    }
  }

  return {
    detectedEnemyIds,
    lastKnownEnemyContacts: [...nextContactsById.values()],
    detectionSources: [
      ...getFixedRadarSources(input.alliedCities, input.alliedSpawnZones, alliedRadarStations),
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

export function getConfidentDetectedEnemyPlatforms(
  enemyPlatforms: MobilePlatform[],
  detectionState: DetectionState,
  minConfidence: number,
): MobilePlatform[] {
  const confidenceById = new Map(
    detectionState.lastKnownEnemyContacts.map((contact) => [
      contact.enemyId,
      contact.confidence ?? 1,
    ]),
  );
  return enemyPlatforms.filter(
    (platform) => (confidenceById.get(platform.id) ?? 0) >= minConfidence,
  );
}
