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
import {
  distanceWorld,
  pixelToWorldDistance,
  worldToPixelDistance,
} from "../models/distance";
import {
  isRadarDisabledForType,
  type DebugSettings,
  type RadarDetectorType,
} from "../models/debug";
import { getSensorEnvelope } from "./intercept";

export type DetectionSourceKind = "fixed-radar" | "platform-sensor";

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

function getPlatformRadarDetectorType(
  platform: MobilePlatform,
): RadarDetectorType {
  return platform.platformClass;
}

function isEligibleAirborneDetector(
  platform: MobilePlatform,
  debugSettings: DebugSettings,
): boolean {
  return (
    platform.team === "allied" &&
    isPlatformDeployed(platform) &&
    !isRadarDisabledForType(
      debugSettings,
      getPlatformRadarDetectorType(platform),
    ) &&
    (platform.role === "recon" || platform.sensors.sensorType === "radar")
  );
}

function getFixedRadarSources(
  alliedCities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  debugSettings: DebugSettings,
): DetectionSource[] {
  if (isRadarDisabledForType(debugSettings, "fixedRadar")) {
    return [];
  }

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
  ];
}

function getPlatformSensorSources(
  alliedPlatforms: MobilePlatform[],
  debugSettings: DebugSettings,
): DetectionSource[] {
  return alliedPlatforms
    .filter((platform) => isEligibleAirborneDetector(platform, debugSettings))
    .map((platform) => ({
      id: `platform-sensor:${platform.id}`,
      name: `${getPlatformDisplayName(platform)} ${platform.sensors.sensorType}`,
      kind: "platform-sensor",
      position: cloneVector(platform.position),
      sensorRangeWorld: platform.sensors.sensorRange,
    }));
}

function detectWithFixedRadar(
  enemyPlatform: MobilePlatform,
  alliedCities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  debugSettings: DebugSettings,
): string | undefined {
  if (isRadarDisabledForType(debugSettings, "fixedRadar")) {
    return undefined;
  }

  const targetType = getPlatformTargetType(enemyPlatform);
  if (!fixedRadarCanSenseTarget(targetType)) {
    return undefined;
  }

  const envelope = getFixedRadarEnvelope(enemyPlatform);
  const fixedObjectives = [...alliedCities, ...alliedSpawnZones];

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
  debugSettings: DebugSettings,
): string | undefined {
  const targetType = getPlatformTargetType(enemyPlatform);

  for (const alliedPlatform of alliedPlatforms) {
    if (
      !isEligibleAirborneDetector(alliedPlatform, debugSettings) ||
      !platformCanSenseTarget(alliedPlatform, targetType)
    ) {
      continue;
    }

    if (
      distanceWorld(alliedPlatform.position, enemyPlatform.position) <=
      getSensorEnvelope(alliedPlatform, enemyPlatform)
    ) {
      return getPlatformDisplayName(alliedPlatform);
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
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  previousState: DetectionState;
  tick: number;
  debugSettings: DebugSettings;
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
        input.debugSettings,
      ) ??
      detectWithPlatformSensor(
        enemyPlatform,
        input.alliedPlatforms,
        input.debugSettings,
      );

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
      ...getFixedRadarSources(
        input.alliedCities,
        input.alliedSpawnZones,
        input.debugSettings,
      ),
      ...getPlatformSensorSources(input.alliedPlatforms, input.debugSettings),
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
