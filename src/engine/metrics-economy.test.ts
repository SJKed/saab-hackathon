import { describe, expect, it } from "vitest";
import {
  createMetricsState,
  getMetricsSnapshot,
  updateMetricsState,
} from "./metrics";
import type { AlliedCity, EnemyBase, MobilePlatform } from "../models/entity";
import type { CombatLogEvent } from "./combat";

function mockPlatform(
  id: string,
  team: "allied" | "enemy",
  platformClass: "fighterJet" | "drone" | "ballisticMissile",
): MobilePlatform {
  return {
    id,
    team,
    platformClass,
    status: "patrolling",
    combat: { durability: 100, maxDurability: 100, armor: 0, evasion: 0 },
  } as unknown as MobilePlatform;
}

describe("metrics economy integration", () => {
  it("accumulates spend and exposes snapshot fields", () => {
    const alliedCities = [
      {
        id: "c1",
        name: "City",
        value: 50,
        threat: 0,
        position: { x: 0, y: 0 },
        maxHealth: 100,
        health: 100,
        defenseRating: 0.4,
        missileAmmunition: 40,
      },
    ] as AlliedCity[];
    const enemyBases = [
      {
        id: "b1",
        name: "Base",
        position: { x: 0, y: 0 },
        maxHealth: 100,
        health: 100,
        defenseRating: 0.5,
        missileAmmunition: 40,
      },
    ] as EnemyBase[];
    const alliedPlatforms = [mockPlatform("a1", "allied", "fighterJet")];
    const enemyPlatforms = [mockPlatform("e1", "enemy", "fighterJet")];

    const state = createMetricsState(
      alliedCities,
      enemyPlatforms,
      alliedPlatforms,
      enemyBases,
      0,
    );

    const events: CombatLogEvent[] = [
      {
        id: "ev1",
        tick: 1,
        kind: "engagement",
        message: "shot",
        source: { id: "a1", name: "Allied", category: "allied-platform" },
        target: { id: "c1", name: "City", category: "allied-city" },
        weaponClass: "airToAirMissile",
        inflictedToTarget: 5,
      },
      {
        id: "ev2",
        tick: 1,
        kind: "destroyed",
        message: "enemy destroyed",
        destroyedUnit: { id: "e1", name: "Enemy", category: "enemy-platform" },
      },
    ];

    const updated = updateMetricsState(state, enemyPlatforms, [], events, 1);
    const snapshot = getMetricsSnapshot(
      updated,
      alliedCities,
      enemyPlatforms,
      alliedPlatforms,
      [],
      enemyBases,
    );

    expect(snapshot.alliedSpendTotal).toBeGreaterThan(0);
    expect(snapshot.enemySpendTotal).toBeGreaterThan(0);
    expect(snapshot.spendDelta).toBeLessThan(0);
    expect(snapshot.exchangeRatio).toBeGreaterThan(1);
  });
});
