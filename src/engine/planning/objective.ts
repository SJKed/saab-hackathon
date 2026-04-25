import type { AlliedCity, MobilePlatform } from "../../models/entity";
import { isPlatformStored } from "../../models/platform-utils";
import type { PlannerActionCandidate } from "./types";

export type PlanningObjectiveWeights = {
  preventedDamage: number;
  missionCost: number;
  reservePreservation: number;
  scarcity: number;
  switching: number;
  cityValue: number;
};

export const defaultPlanningWeights: PlanningObjectiveWeights = {
  preventedDamage: 1.2,
  missionCost: 0.26,
  reservePreservation: 0.55,
  scarcity: 0.7,
  switching: 0.65,
  cityValue: 0.2,
};

export function getPlatformScarcityCost(
  platform: MobilePlatform,
  alliedPlatforms: MobilePlatform[],
): number {
  const sameClassStoredCount = alliedPlatforms.filter(
    (candidate) =>
      candidate.team === "allied" &&
      candidate.platformClass === platform.platformClass &&
      isPlatformStored(candidate),
  ).length;

  if (platform.platformClass === "ballisticMissile") {
    return sameClassStoredCount <= 1 ? 3.4 : sameClassStoredCount <= 2 ? 2.4 : 1.3;
  }

  if (platform.platformClass === "fighterJet") {
    return sameClassStoredCount <= 1 ? 2.2 : sameClassStoredCount <= 2 ? 1.4 : 0.8;
  }

  return sameClassStoredCount <= 2 ? 1.2 : 0.45;
}

export function getSwitchingCost(platform: MobilePlatform): number {
  if (platform.status === "intercepting" || platform.status === "reinforcing") {
    return 1.4;
  }

  if (platform.status === "transit") {
    return 0.9;
  }

  return 0.25;
}

export function scorePlannerCandidate(
  candidate: Pick<
    PlannerActionCandidate,
    | "expectedDamagePrevented"
    | "expectedMissionCost"
    | "reserveValuePreserved"
    | "scarcityCost"
    | "switchingCost"
    | "targetCity"
  >,
  weights: PlanningObjectiveWeights = defaultPlanningWeights,
): number {
  return (
    candidate.expectedDamagePrevented * weights.preventedDamage +
    -candidate.expectedMissionCost * weights.missionCost +
    candidate.reserveValuePreserved * weights.reservePreservation +
    (candidate.targetCity?.value ?? 0) * weights.cityValue -
    candidate.scarcityCost * weights.scarcity -
    candidate.switchingCost * weights.switching
  );
}

export function getCityPriorityBoost(city: AlliedCity | undefined): number {
  if (!city) {
    return 0;
  }

  return city.value * (1 + city.threat * 42);
}
