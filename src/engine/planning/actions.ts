import type {
  AlliedCity,
  AlliedSpawnZone,
  MobilePlatform,
} from "../../models/entity";
import { getMissionFuelBudgetSeconds } from "../../models/platform-recovery";
import {
  distanceBetween,
  getPlatformDisplayName,
  hasUsablePayload,
  isPlatformDeployed,
  isPlatformDestroyed,
  isPlatformStored,
} from "../../models/platform-utils";
import { predictIntercept } from "../intercept";
import {
  getAlliedCoverageScoreForCity,
  type AlliedForcePostureSnapshot,
} from "../posture";
import { buildEnemyIntentBeliefs } from "./beliefs";
import { estimateCityResidualRisk, estimateEnemyExpectedDamage } from "./forecast";
import {
  getCityPriorityBoost,
  getPlatformScarcityCost,
  getSwitchingCost,
  scorePlannerCandidate,
} from "./objective";
import type { EnemyIntentBelief, PlannerActionCandidate } from "./types";

type CandidateGenerationResult = {
  beliefs: EnemyIntentBelief[];
  candidates: PlannerActionCandidate[];
};

const plannerFuelCommitmentBufferSeconds = 3;

function isPlannerAvailable(
  platform: MobilePlatform,
  alliedSpawnZones: AlliedSpawnZone[],
): boolean {
  if (platform.team !== "allied") {
    return false;
  }

  if (isPlatformDestroyed(platform) || platform.engagedWithId) {
    return false;
  }

  if (
    platform.status === "returning" ||
    platform.status === "destroyed" ||
    platform.deploymentDelaySeconds > 0
  ) {
    return false;
  }

  return (
    getMissionFuelBudgetSeconds(platform, alliedSpawnZones, []) >
    plannerFuelCommitmentBufferSeconds
  );
}

function hasReusablePayload(platform: MobilePlatform): boolean {
  return hasUsablePayload(platform);
}

function getReserveValuePreserved(
  platform: MobilePlatform,
  postureSnapshot: AlliedForcePostureSnapshot,
): number {
  if (!isPlatformStored(platform)) {
    return postureSnapshot.recallPressureActive ? 1.1 : 0.45;
  }

  return postureSnapshot.recallPressureActive ? 2.8 : 0.7;
}

export function generatePlannerCandidates(input: {
  cities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  postureSnapshot: AlliedForcePostureSnapshot;
}): CandidateGenerationResult {
  const beliefs = buildEnemyIntentBeliefs(input.cities, input.enemyPlatforms);
  const candidates: PlannerActionCandidate[] = [];
  const availablePlatforms = input.alliedPlatforms.filter((platform) =>
    isPlannerAvailable(platform, input.alliedSpawnZones),
  );

  for (const enemyPlatform of input.enemyPlatforms.filter(isPlatformDeployed)) {
    const belief = beliefs.find((entry) => entry.enemyId === enemyPlatform.id);
    const targetCity = input.cities.find(
      (city) => city.id === belief?.mostLikelyCityId,
    );
    const enemyExpectedDamage = estimateEnemyExpectedDamage(
      enemyPlatform,
      input.cities,
      belief,
    );
    const interceptCandidates = availablePlatforms
      .filter(hasReusablePayload)
      .map((platform) => {
        const intercept = predictIntercept(platform, enemyPlatform, input.cities);
        if (!intercept?.feasibleBeforeImpact || !intercept.acquisitionFeasible) {
          return undefined;
        }
        if (
          getMissionFuelBudgetSeconds(platform, input.alliedSpawnZones, []) <=
          intercept.timeToIntercept + plannerFuelCommitmentBufferSeconds
        ) {
          return undefined;
        }

        const expectedDamagePrevented = enemyExpectedDamage;
        const scarcityCost = getPlatformScarcityCost(platform, input.alliedPlatforms);
        const switchingCost = getSwitchingCost(platform);
        const reserveValuePreserved =
          getReserveValuePreserved(platform, input.postureSnapshot) * 0.25;
        const candidate: PlannerActionCandidate = {
          id: `intercept:${platform.id}:${enemyPlatform.id}`,
          mission: "intercept",
          resourceId: platform.id,
          resourceName: getPlatformDisplayName(platform),
          targetId: enemyPlatform.id,
          targetName: getPlatformDisplayName(enemyPlatform),
          distance: intercept.distance,
          interceptTimeSeconds: intercept.timeToIntercept,
          confidence: belief?.confidence ?? 0.5,
          expectedDamagePrevented,
          reserveValuePreserved,
          switchingCost,
          scarcityCost,
          baseScore: 0,
          rationale:
            `${getPlatformDisplayName(platform)} can intercept ${getPlatformDisplayName(enemyPlatform)} ` +
            `before projected impact with ${(((belief?.confidence ?? 0.5) * 100)).toFixed(0)}% intent confidence.`,
          sourcePlatform: platform,
          targetCity,
        };
        candidate.baseScore =
          scorePlannerCandidate(candidate) +
          getCityPriorityBoost(targetCity) * 0.15 -
          intercept.timeToIntercept * 0.85;
        return candidate;
      })
      .filter((candidate): candidate is PlannerActionCandidate => Boolean(candidate))
      .sort((left, right) => right.baseScore - left.baseScore)
      .slice(0, 3);

    candidates.push(...interceptCandidates);
  }

  const threatenedCities = input.cities
    .map((city) => ({
      city,
      residualRisk: estimateCityResidualRisk(city, input.enemyPlatforms, beliefs),
    }))
    .filter(({ city, residualRisk }) => city.threat > 0.0025 || residualRisk >= 2.5)
    .sort((left, right) => right.residualRisk - left.residualRisk);

  for (const { city, residualRisk } of threatenedCities.slice(0, 5)) {
    const reinforceCandidates = availablePlatforms
      .filter((platform) => platform.weapons.some((weapon) => weapon.ammunition > 0))
      .map((platform) => {
        const localCoverage = getAlliedCoverageScoreForCity(platform, city);
        const distance = distanceBetween(platform.position, city.position);
        const expectedDamagePrevented =
          residualRisk * (0.45 + localCoverage * 0.22) + city.value * 0.8;
        const scarcityCost = getPlatformScarcityCost(platform, input.alliedPlatforms) * 0.75;
        const switchingCost = getSwitchingCost(platform) * 0.85;
        const reserveValuePreserved = getReserveValuePreserved(
          platform,
          input.postureSnapshot,
        );
        const candidate: PlannerActionCandidate = {
          id: `reinforce:${platform.id}:${city.id}`,
          mission: "reinforce",
          resourceId: platform.id,
          resourceName: getPlatformDisplayName(platform),
          targetId: city.id,
          targetName: city.name ?? city.id,
          distance,
          confidence: Math.max(0.42, Math.min(0.95, residualRisk / 8)),
          expectedDamagePrevented,
          reserveValuePreserved,
          switchingCost,
          scarcityCost,
          baseScore: 0,
          rationale:
            `${getPlatformDisplayName(platform)} improves the defensive screen over ${city.name ?? city.id} ` +
            `where residual risk remains elevated.`,
          sourcePlatform: platform,
          targetCity: city,
        };
        candidate.baseScore =
          scorePlannerCandidate(candidate) +
          localCoverage * 1.6 +
          getCityPriorityBoost(city) * 0.12 -
          distance / 85;
        return candidate;
      })
      .sort((left, right) => right.baseScore - left.baseScore)
      .slice(0, 2);

    candidates.push(...reinforceCandidates);
  }

  return {
    beliefs,
    candidates: candidates
      .sort((left, right) => right.baseScore - left.baseScore)
      .slice(0, 24),
  };
}
