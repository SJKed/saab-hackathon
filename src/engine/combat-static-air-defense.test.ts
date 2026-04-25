import { describe, expect, it } from "vitest";
import { resolveCombat } from "./combat";
import { defaultDebugSettings } from "../models/debug";
import type {
  AlliedCity,
  AlliedRadarStation,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
} from "../models/entity";

function createPlatform(
  id: string,
  team: "allied" | "enemy",
  position: { x: number; y: number },
): MobilePlatform {
  return {
    id,
    team,
    platformClass: "fighterJet",
    role: team === "allied" ? "interceptor" : "strike",
    position,
    velocity: { x: 0, y: 0 },
    status: "transit",
    threatLevel: 1,
    maxSpeed: 10,
    cruiseSpeed: 8,
    acceleration: 5,
    enduranceSeconds: 120,
    maxEnduranceSeconds: 120,
    oneWay: false,
    deploymentDelaySeconds: 0,
    combatPhaseTimeSeconds: 0,
    combat: {
      durability: 120,
      maxDurability: 120,
      evasion: 0.1,
      signature: 0.9,
      armor: 0.05,
    },
    sensors: {
      sensorRange: 220,
      sensorType: "radar",
      trackingQuality: 0.8,
      targetTypesSupported: ["fighterJet", "drone", "ballisticMissile", "city"],
      jamResistance: 0.7,
    },
    weapons: [],
  };
}

function createAlliedCity(ammo: number): AlliedCity {
  return {
    id: "C-1",
    name: "City 1",
    position: { x: 0, y: 0 },
    threat: 0,
    value: 10,
    maxHealth: 260,
    health: 260,
    defenseRating: 0.22,
    missileAmmunition: ammo,
    missileMaxAmmunition: 40,
  };
}

function createEnemyBase(ammo: number): EnemyBase {
  return {
    id: "E-BASE-1",
    name: "Enemy Base 1",
    position: { x: 0, y: 0 },
    maxHealth: 240,
    health: 240,
    defenseRating: 0.18,
    missileAmmunition: ammo,
    missileMaxAmmunition: 40,
  };
}

describe("static air defense", () => {
  it("cities fire SAMs at detected enemies and consume missile ammo", () => {
    const alliedCities: AlliedCity[] = [createAlliedCity(40)];
    const alliedRadarStations: AlliedRadarStation[] = [];
    const alliedSpawnZones: AlliedSpawnZone[] = [];
    const enemyBases: EnemyBase[] = [];
    const alliedPlatforms: MobilePlatform[] = [];
    const enemyPlatforms: MobilePlatform[] = [
      createPlatform("E-PLT-1", "enemy", { x: 20, y: 0 }),
    ];

    const result = resolveCombat({
      alliedCities,
      alliedRadarStations,
      alliedSpawnZones,
      enemyBases,
      alliedPlatforms,
      enemyPlatforms,
      detectedEnemyIds: ["E-PLT-1"],
      tick: 1,
      debugSettings: defaultDebugSettings,
    });

    expect(result.alliedCities[0]?.missileAmmunition).toBe(39);
    expect(
      result.events.some((event) => event.weaponClass === "surfaceToAirMissile"),
    ).toBe(true);
  });

  it("enemy bases fire SAMs at allied aircraft and stop when depleted", () => {
    const alliedCities: AlliedCity[] = [];
    const alliedRadarStations: AlliedRadarStation[] = [];
    const alliedSpawnZones: AlliedSpawnZone[] = [];
    const enemyBases: EnemyBase[] = [createEnemyBase(1)];
    const alliedPlatforms: MobilePlatform[] = [
      createPlatform("A-PLT-1", "allied", { x: 20, y: 0 }),
    ];
    const enemyPlatforms: MobilePlatform[] = [];

    const firstTick = resolveCombat({
      alliedCities,
      alliedRadarStations,
      alliedSpawnZones,
      enemyBases,
      alliedPlatforms,
      enemyPlatforms,
      tick: 1,
      debugSettings: defaultDebugSettings,
    });
    expect(firstTick.enemyBases[0]?.missileAmmunition).toBe(0);
    expect(
      firstTick.events.some((event) => event.weaponClass === "surfaceToAirMissile"),
    ).toBe(true);

    const secondTick = resolveCombat({
      alliedCities,
      alliedRadarStations,
      alliedSpawnZones,
      enemyBases: firstTick.enemyBases,
      alliedPlatforms: firstTick.alliedPlatforms,
      enemyPlatforms: firstTick.enemyPlatforms,
      tick: 2,
      debugSettings: defaultDebugSettings,
    });
    expect(
      secondTick.events.some((event) => event.weaponClass === "surfaceToAirMissile"),
    ).toBe(false);
  });
});
