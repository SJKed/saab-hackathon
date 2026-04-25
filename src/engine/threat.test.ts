import { describe, expect, it } from "vitest";
import { calculateCityThreat } from "./threat";
import type { AlliedCity, MobilePlatform } from "../models/entity";

function createEnemy(overrides?: Partial<MobilePlatform>): MobilePlatform {
  return {
    id: "enemy-1",
    team: "enemy",
    platformClass: "fighterJet",
    role: "strike",
    position: { x: 10, y: 0 },
    velocity: { x: 2, y: 0 },
    status: "transit",
    threatLevel: 1,
    maxSpeed: 2,
    cruiseSpeed: 1.5,
    acceleration: 1,
    enduranceSeconds: 200,
    maxEnduranceSeconds: 200,
    oneWay: false,
    deploymentDelaySeconds: 0,
    combatPhaseTimeSeconds: 0,
    combat: {
      durability: 100,
      maxDurability: 100,
      evasion: 0.2,
      signature: 0.7,
      armor: 0.1,
    },
    sensors: {
      sensorRange: 100,
      sensorType: "radar",
      trackingQuality: 0.6,
      targetTypesSupported: ["fighterJet", "drone", "ballisticMissile", "city"],
      jamResistance: 0.6,
    },
    weapons: [],
    ...overrides,
  };
}

const city: AlliedCity = {
  id: "city-1",
  name: "City",
  position: { x: 0, y: 0 },
  threat: 0,
  value: 10,
  maxHealth: 100,
  health: 100,
  defenseRating: 0.5,
};

describe("intent-aware threat scoring", () => {
  it("raises threat when enemy intent is focused on the city", () => {
    const untargeted = calculateCityThreat(city, [createEnemy()]);
    const targeted = calculateCityThreat(city, [createEnemy({ targetId: city.id })]);
    expect(targeted).toBeGreaterThan(untargeted);
  });

  it("raises threat for fast-approach time pressure", () => {
    const slowApproach = calculateCityThreat(
      city,
      [createEnemy({ position: { x: 1, y: 0 }, velocity: { x: 1, y: 0 } })],
    );
    const fastApproach = calculateCityThreat(
      city,
      [createEnemy({ position: { x: 1, y: 0 }, velocity: { x: 280, y: 0 } })],
    );
    expect(fastApproach).toBeGreaterThan(slowApproach);
  });
});
