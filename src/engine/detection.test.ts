import { describe, expect, it } from "vitest";
import {
  calculateDetectionState,
  createDetectionState,
  getConfidentDetectedEnemyPlatforms,
} from "./detection";
import type { AlliedCity, AlliedRadarStation, AlliedSpawnZone, MobilePlatform } from "../models/entity";

function createEnemyRadarPlatform(): MobilePlatform {
  return {
    id: "E-1",
    team: "enemy",
    platformClass: "fighterJet",
    role: "strike",
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    status: "transit",
    threatLevel: 1,
    maxSpeed: 1,
    cruiseSpeed: 1,
    acceleration: 1,
    enduranceSeconds: 10,
    maxEnduranceSeconds: 10,
    oneWay: false,
    deploymentDelaySeconds: 0,
    combatPhaseTimeSeconds: 0,
    combat: {
      durability: 10,
      maxDurability: 10,
      evasion: 0.2,
      signature: 0.8,
      armor: 0.1,
    },
    sensors: {
      sensorRange: 500,
      sensorType: "radar",
      trackingQuality: 0.8,
      targetTypesSupported: ["fighterJet", "drone", "ballisticMissile", "city"],
      jamResistance: 0.5,
    },
    weapons: [],
  };
}

function createAlliedPassivePlatform(): MobilePlatform {
  return {
    ...createEnemyRadarPlatform(),
    id: "A-1",
    team: "allied",
    role: "recon",
    sensors: {
      sensorRange: 500,
      sensorType: "passive",
      trackingQuality: 0.6,
      targetTypesSupported: ["fighterJet", "drone", "ballisticMissile"],
      jamResistance: 0.5,
    },
  };
}

describe("detection passive sensing", () => {
  it("detects radar-emitting enemy with passive allied platform", () => {
    const alliedCities: AlliedCity[] = [];
    const alliedSpawnZones: AlliedSpawnZone[] = [];
    const alliedRadarStations: AlliedRadarStation[] = [];
    const alliedPlatforms = [createAlliedPassivePlatform()];
    const enemyPlatforms = [createEnemyRadarPlatform()];
    const result = calculateDetectionState({
      alliedCities,
      alliedSpawnZones,
      alliedRadarStations,
      alliedPlatforms,
      enemyPlatforms,
      previousState: createDetectionState(),
      tick: 1,
    });
    expect(result.detectedEnemyIds).toContain("E-1");
    expect(result.lastKnownEnemyContacts[0]?.detectedBy.toLowerCase()).toContain("passive");
  });

  it("keeps stale contacts with decaying confidence", () => {
    const alliedCities: AlliedCity[] = [];
    const alliedSpawnZones: AlliedSpawnZone[] = [];
    const alliedRadarStations: AlliedRadarStation[] = [];
    const alliedPlatforms = [createAlliedPassivePlatform()];
    const enemyPlatforms = [createEnemyRadarPlatform()];
    const first = calculateDetectionState({
      alliedCities,
      alliedSpawnZones,
      alliedRadarStations,
      alliedPlatforms,
      enemyPlatforms,
      previousState: createDetectionState(),
      tick: 1,
    });
    const stale = calculateDetectionState({
      alliedCities,
      alliedSpawnZones,
      alliedRadarStations,
      alliedPlatforms: [],
      enemyPlatforms,
      previousState: first,
      tick: 4,
    });
    expect(stale.lastKnownEnemyContacts[0]).toBeDefined();
    expect(stale.lastKnownEnemyContacts[0]?.confidence).toBeLessThan(
      first.lastKnownEnemyContacts[0]?.confidence ?? 1,
    );
    expect(stale.detectedEnemyIds).toContain("E-1");
  });

  it("filters contacts below a confidence threshold", () => {
    const alliedCities: AlliedCity[] = [];
    const alliedSpawnZones: AlliedSpawnZone[] = [];
    const alliedRadarStations: AlliedRadarStation[] = [];
    const enemyPlatforms = [createEnemyRadarPlatform()];
    const first = calculateDetectionState({
      alliedCities,
      alliedSpawnZones,
      alliedRadarStations,
      alliedPlatforms: [createAlliedPassivePlatform()],
      enemyPlatforms,
      previousState: createDetectionState(),
      tick: 1,
    });
    const lowConfidence = calculateDetectionState({
      alliedCities,
      alliedSpawnZones,
      alliedRadarStations,
      alliedPlatforms: [],
      enemyPlatforms,
      previousState: first,
      tick: 12,
    });
    const confidentTracks = getConfidentDetectedEnemyPlatforms(
      enemyPlatforms,
      lowConfidence,
      0.5,
    );
    expect(confidentTracks).toHaveLength(0);
  });
});
