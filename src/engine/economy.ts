import type { CombatLogEvent, CombatUnitCategory } from "./combat";
import type { MobilePlatform, Weapon } from "../models/entity";

export type EconomyTeam = "allied" | "enemy";

export type EconomyBreakdown = {
  munitions: number;
  attrition: number;
  infrastructure: number;
  total: number;
};

export type EconomyLedger = {
  allied: EconomyBreakdown;
  enemy: EconomyBreakdown;
};

export type PlatformEconomyProfile = {
  team: EconomyTeam;
  platformClass: MobilePlatform["platformClass"];
};

const platformLossCostByClass: Record<MobilePlatform["platformClass"], number> = {
  fighterJet: 100,
  drone: 35,
  ballisticMissile: 20,
};

const shotCostByWeaponClass: Record<Weapon["weaponClass"], number> = {
  rapidFire: 1,
  airToAirMissile: 8,
  bomb: 12,
  surfaceToAirMissile: 6,
  terminalPayload: 15,
};

const infrastructureCostPerDamageByCategory: Partial<Record<CombatUnitCategory, number>> = {
  "allied-city": 2,
  "enemy-base": 1.5,
  "allied-radar-station": 1.2,
};

function createBreakdown(): EconomyBreakdown {
  return {
    munitions: 0,
    attrition: 0,
    infrastructure: 0,
    total: 0,
  };
}

export function createEconomyLedger(): EconomyLedger {
  return {
    allied: createBreakdown(),
    enemy: createBreakdown(),
  };
}

function getTeamForUnitCategory(
  category: CombatUnitCategory | undefined,
): EconomyTeam | undefined {
  if (!category) {
    return undefined;
  }
  if (category.startsWith("allied-")) {
    return "allied";
  }
  if (category.startsWith("enemy-")) {
    return "enemy";
  }
  return undefined;
}

function addSpend(
  ledger: EconomyLedger,
  team: EconomyTeam,
  kind: keyof Omit<EconomyBreakdown, "total">,
  amount: number,
): void {
  if (amount <= 0) {
    return;
  }
  const normalized = Math.max(0, amount);
  ledger[team][kind] += normalized;
  ledger[team].total += normalized;
}

export function buildPlatformEconomyCatalog(
  platforms: MobilePlatform[],
): Record<string, PlatformEconomyProfile> {
  const catalog: Record<string, PlatformEconomyProfile> = {};
  for (const platform of platforms) {
    catalog[platform.id] = {
      team: platform.team === "allied" ? "allied" : "enemy",
      platformClass: platform.platformClass,
    };
  }
  return catalog;
}

export function estimatePlatformLossCost(
  platformClass: MobilePlatform["platformClass"],
): number {
  return platformLossCostByClass[platformClass];
}

export function estimateWeaponShotCost(weaponClass: Weapon["weaponClass"]): number {
  return shotCostByWeaponClass[weaponClass];
}

export function accumulateEconomyFromCombatEvents(input: {
  events: CombatLogEvent[];
  platformCatalog: Record<string, PlatformEconomyProfile>;
  alreadyCountedDestroyedIds: Set<string>;
}): { ledgerDelta: EconomyLedger; newlyCountedDestroyedIds: string[] } {
  const ledgerDelta = createEconomyLedger();
  const newlyCountedDestroyedIds: string[] = [];

  for (const event of input.events) {
    if (event.kind === "engagement") {
      if (event.weaponClass) {
        const team = getTeamForUnitCategory(event.source?.category);
        if (team) {
          addSpend(ledgerDelta, team, "munitions", estimateWeaponShotCost(event.weaponClass));
        }
      }

      const targetCategory = event.target?.category;
      const infrastructureRate =
        targetCategory === undefined
          ? undefined
          : infrastructureCostPerDamageByCategory[targetCategory];
      if (infrastructureRate && (event.inflictedToTarget ?? 0) > 0) {
        const defendingTeam = getTeamForUnitCategory(targetCategory);
        if (defendingTeam) {
          addSpend(
            ledgerDelta,
            defendingTeam,
            "infrastructure",
            (event.inflictedToTarget ?? 0) * infrastructureRate,
          );
        }
      }
      continue;
    }

    if (event.kind !== "destroyed" || !event.destroyedUnit) {
      continue;
    }

    const destroyedUnitId = event.destroyedUnit.id;
    if (input.alreadyCountedDestroyedIds.has(destroyedUnitId)) {
      continue;
    }
    const profile = input.platformCatalog[destroyedUnitId];
    if (!profile) {
      continue;
    }
    input.alreadyCountedDestroyedIds.add(destroyedUnitId);
    newlyCountedDestroyedIds.push(destroyedUnitId);
    addSpend(
      ledgerDelta,
      profile.team,
      "attrition",
      estimatePlatformLossCost(profile.platformClass),
    );
  }

  return {
    ledgerDelta,
    newlyCountedDestroyedIds,
  };
}

export function mergeEconomyLedger(
  current: EconomyLedger,
  delta: EconomyLedger,
): EconomyLedger {
  const merged = createEconomyLedger();
  for (const team of ["allied", "enemy"] as const) {
    merged[team].munitions = current[team].munitions + delta[team].munitions;
    merged[team].attrition = current[team].attrition + delta[team].attrition;
    merged[team].infrastructure =
      current[team].infrastructure + delta[team].infrastructure;
    merged[team].total = current[team].total + delta[team].total;
  }
  return merged;
}

export function getSpendDelta(ledger: EconomyLedger): number {
  return ledger.allied.total - ledger.enemy.total;
}

export function getExchangeRatio(ledger: EconomyLedger): number {
  return ledger.enemy.total / Math.max(1, ledger.allied.total);
}

export function estimatePlannerMissionCost(input: {
  platformClass: MobilePlatform["platformClass"];
  mission: "intercept" | "reinforce";
  confidence: number;
}): number {
  const baseShotCost =
    input.platformClass === "fighterJet"
      ? shotCostByWeaponClass.airToAirMissile
      : input.platformClass === "drone"
        ? shotCostByWeaponClass.rapidFire
        : shotCostByWeaponClass.terminalPayload;
  const maneuverCost = input.mission === "intercept" ? 6 : 3;
  const uncertaintyMultiplier = 1 + Math.max(0, 0.8 - input.confidence) * 0.9;
  return (baseShotCost + maneuverCost) * uncertaintyMultiplier;
}
