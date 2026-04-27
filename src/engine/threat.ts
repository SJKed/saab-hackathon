import type { AlliedCity, MobilePlatform } from "../models/entity";
import {
  distanceWorld,
  pixelRateToWorldRate,
  pixelToWorldDistance,
} from "../models/distance";
import {
  getEstimatedImmediateDamageAgainstTarget,
  isPlatformDeployed,
} from "../models/platform-utils";
import { buildEnemyIntentBeliefs } from "./planning/beliefs";
import type { EnemyIntentBelief } from "./planning/types";

const minimumDistance = pixelToWorldDistance(1);
const tacticalThreatHorizonSeconds = 18;
const threatNormalization = 12000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getThreatUrgencyFactor(enemyPlatform: MobilePlatform, city: AlliedCity): number {
  const speed = pixelRateToWorldRate(
    Math.hypot(enemyPlatform.velocity.x, enemyPlatform.velocity.y),
  );
  if (speed <= 0.001) {
    return enemyPlatform.targetId === city.id ? 0.08 : 0;
  }

  const timeToCity =
    Math.max(
      minimumDistance,
      distanceWorld(enemyPlatform.position, city.position),
    ) / speed;

  if (timeToCity >= tacticalThreatHorizonSeconds) {
    return enemyPlatform.targetId === city.id ? 0.02 : 0;
  }

  const normalizedUrgency = 1 - timeToCity / tacticalThreatHorizonSeconds;
  return clamp(normalizedUrgency ** 3, 0, 1);
}

function getDeliveryFeasibilityFactor(
  enemyPlatform: MobilePlatform,
  city: AlliedCity,
): number {
  const speed = pixelRateToWorldRate(
    Math.hypot(enemyPlatform.velocity.x, enemyPlatform.velocity.y),
  );
  if (speed <= 0.001) {
    return enemyPlatform.targetId === city.id ? 0.1 : 0;
  }

  const timeToCity =
    Math.max(
      minimumDistance,
      distanceWorld(enemyPlatform.position, city.position),
    ) / speed;
  const remainingTimeMargin = enemyPlatform.enduranceSeconds - timeToCity;

  if (remainingTimeMargin <= 0) {
    return 0;
  }

  return clamp(remainingTimeMargin / Math.max(6, tacticalThreatHorizonSeconds * 0.4), 0, 1);
}

export function calculateCityThreat(
  city: AlliedCity,
  enemyPlatforms: MobilePlatform[],
  beliefs: EnemyIntentBelief[] = [],
): number {
  const beliefsByEnemyId = new Map(beliefs.map((belief) => [belief.enemyId, belief]));

  return enemyPlatforms.reduce((totalThreat, enemyPlatform) => {
    if (!isPlatformDeployed(enemyPlatform)) {
      return totalThreat;
    }

    const belief = beliefsByEnemyId.get(enemyPlatform.id);
    const targetProbability =
      belief?.cityProbabilities.find((entry) => entry.cityId === city.id)?.probability ??
      (enemyPlatform.targetId === city.id ? 1 : 0);
    const potentialDamage = getEstimatedImmediateDamageAgainstTarget(
      enemyPlatform,
      "city",
    );
    if (targetProbability <= 0.001 || potentialDamage <= 0) {
      return totalThreat;
    }

    const urgencyFactor = getThreatUrgencyFactor(enemyPlatform, city);
    const feasibilityFactor = getDeliveryFeasibilityFactor(enemyPlatform, city);
    if (urgencyFactor <= 0 || feasibilityFactor <= 0) {
      return totalThreat;
    }

    const targetCommitmentBias = enemyPlatform.targetId === city.id ? 1.15 : 1;
    const threatSeverityFactor = 0.45 + enemyPlatform.threatLevel * 0.75;
    const contribution =
      (targetProbability *
        potentialDamage *
        urgencyFactor *
        feasibilityFactor *
        targetCommitmentBias *
        threatSeverityFactor) /
      threatNormalization;

    return totalThreat + contribution;
  }, 0);
}

export function calculateThreatsForCities(
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): AlliedCity[] {
  const beliefs = buildEnemyIntentBeliefs(cities, enemyPlatforms);

  return cities.map((city) => ({
    ...city,
    threat: calculateCityThreat(city, enemyPlatforms, beliefs),
  }));
}
