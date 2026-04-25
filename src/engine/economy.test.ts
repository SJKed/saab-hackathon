import { describe, expect, it } from "vitest";
import {
  accumulateEconomyFromCombatEvents,
  createEconomyLedger,
  estimatePlannerMissionCost,
  getExchangeRatio,
  getSpendDelta,
  mergeEconomyLedger,
  type PlatformEconomyProfile,
} from "./economy";
import type { CombatLogEvent } from "./combat";

describe("economy", () => {
  it("accounts munitions, infrastructure, and attrition deterministically", () => {
    const events: CombatLogEvent[] = [
      {
        id: "e-1",
        tick: 1,
        kind: "engagement",
        message: "Shot",
        source: { id: "a1", name: "A1", category: "allied-platform" },
        target: { id: "c1", name: "City", category: "allied-city" },
        weaponClass: "airToAirMissile",
        inflictedToTarget: 10,
      },
      {
        id: "e-2",
        tick: 1,
        kind: "destroyed",
        message: "Destroyed",
        destroyedUnit: { id: "e1", name: "Enemy", category: "enemy-platform" },
      },
    ];
    const platformCatalog: Record<string, PlatformEconomyProfile> = {
      e1: { team: "enemy", platformClass: "fighterJet" },
    };

    const counted = new Set<string>();
    const first = accumulateEconomyFromCombatEvents({
      events,
      platformCatalog,
      alreadyCountedDestroyedIds: counted,
    });
    const second = accumulateEconomyFromCombatEvents({
      events,
      platformCatalog,
      alreadyCountedDestroyedIds: counted,
    });

    expect(first.ledgerDelta.allied.munitions).toBe(8);
    expect(first.ledgerDelta.allied.infrastructure).toBe(20);
    expect(first.ledgerDelta.enemy.attrition).toBe(100);
    expect(second.ledgerDelta.enemy.attrition).toBe(0);
  });

  it("computes delta and exchange ratio", () => {
    const ledger = mergeEconomyLedger(createEconomyLedger(), {
      allied: { munitions: 10, attrition: 20, infrastructure: 5, total: 35 },
      enemy: { munitions: 5, attrition: 50, infrastructure: 5, total: 60 },
    });
    expect(getSpendDelta(ledger)).toBe(-25);
    expect(getExchangeRatio(ledger)).toBeCloseTo(1.71, 2);
  });

  it("estimates higher planner cost for low confidence intercepts", () => {
    const highConfidence = estimatePlannerMissionCost({
      platformClass: "fighterJet",
      mission: "intercept",
      confidence: 0.9,
    });
    const lowConfidence = estimatePlannerMissionCost({
      platformClass: "fighterJet",
      mission: "intercept",
      confidence: 0.4,
    });
    expect(lowConfidence).toBeGreaterThan(highConfidence);
  });
});
