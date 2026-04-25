import { describe, expect, it } from "vitest";
import { createAlliedPlatforms, createEnemyPlatforms } from "./platform-factories";
import type { AlliedCity, AlliedSpawnZone, EnemyBase } from "../models/entity";

function createSpawnZone(id: string): AlliedSpawnZone {
  return {
    id,
    name: id,
    position: { x: 100, y: 100 },
    maxHealth: 200,
    health: 200,
    defenseRating: 0.2,
  };
}

function createEnemyBase(id: string): EnemyBase {
  return {
    id,
    name: id,
    position: { x: 700, y: 120 },
    maxHealth: 240,
    health: 240,
    defenseRating: 0.18,
  };
}

function createCity(id: string): AlliedCity {
  return {
    id,
    name: id,
    position: { x: 200, y: 500 },
    value: 10,
    threat: 0,
    maxHealth: 260,
    health: 260,
    defenseRating: 0.22,
  };
}

describe("platform factory loadout constraints", () => {
  it("applies fighter ammo limits for allied platforms", () => {
    const alliedPlatforms = createAlliedPlatforms([createSpawnZone("A1")]);
    const fighter = alliedPlatforms.find((platform) => platform.platformClass === "fighterJet");
    expect(fighter).toBeDefined();
    const rapidFire = fighter?.weapons.find((weapon) => weapon.weaponClass === "rapidFire");
    const missiles = fighter?.weapons.find(
      (weapon) => weapon.weaponClass === "airToAirMissile",
    );
    const bombs = fighter?.weapons.find((weapon) => weapon.weaponClass === "bomb");
    expect(rapidFire?.maxAmmunition).toBe(4);
    expect(missiles?.maxAmmunition).toBe(8);
    expect(bombs?.maxAmmunition).toBe(3);
  });

  it("removes rapidFire from allied drones", () => {
    const alliedPlatforms = createAlliedPlatforms([createSpawnZone("A1")]);
    const drone = alliedPlatforms.find((platform) => platform.platformClass === "drone");
    expect(drone).toBeDefined();
    expect(drone?.weapons.some((weapon) => weapon.weaponClass === "rapidFire")).toBe(false);
    expect(drone?.weapons.every((weapon) => weapon.weaponClass !== "bomb")).toBe(true);
  });

  it("applies fighter ammo limits for enemy platforms", () => {
    const enemyPlatforms = createEnemyPlatforms([createEnemyBase("E1")], [createCity("C1")]);
    const fighter = enemyPlatforms.find((platform) => platform.platformClass === "fighterJet");
    expect(fighter).toBeDefined();
    const rapidFire = fighter?.weapons.find((weapon) => weapon.weaponClass === "rapidFire");
    const missiles = fighter?.weapons.find(
      (weapon) => weapon.weaponClass === "airToAirMissile",
    );
    const bombs = fighter?.weapons.find((weapon) => weapon.weaponClass === "bomb");
    expect(rapidFire?.maxAmmunition).toBe(4);
    expect(missiles?.maxAmmunition).toBe(8);
    expect(bombs?.maxAmmunition).toBe(3);
  });

  it("removes rapidFire from enemy drones", () => {
    const enemyPlatforms = createEnemyPlatforms([createEnemyBase("E1")], [createCity("C1")]);
    const drone = enemyPlatforms.find((platform) => platform.platformClass === "drone");
    expect(drone).toBeDefined();
    expect(drone?.weapons.some((weapon) => weapon.weaponClass === "rapidFire")).toBe(false);
    expect(drone?.weapons.some((weapon) => weapon.weaponClass === "bomb")).toBe(true);
  });
});
