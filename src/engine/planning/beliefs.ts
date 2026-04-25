import type { AlliedCity, MobilePlatform } from "../../models/entity";
import { distanceKm } from "../../models/distance";
import { isPlatformDeployed } from "../../models/platform-utils";
import type { EnemyIntentBelief } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getHeadingAlignment(platform: MobilePlatform, city: AlliedCity): number {
  const speed = Math.hypot(platform.velocity.x, platform.velocity.y);
  if (speed <= 0.001) {
    return 0.5;
  }

  const directionToCityX = city.position.x - platform.position.x;
  const directionToCityY = city.position.y - platform.position.y;
  const directionLength = Math.hypot(directionToCityX, directionToCityY);
  if (directionLength <= 0.001) {
    return 1;
  }

  const dot =
    (platform.velocity.x / speed) * (directionToCityX / directionLength) +
    (platform.velocity.y / speed) * (directionToCityY / directionLength);
  return clamp((dot + 1) * 0.5, 0.05, 1);
}

function getPlatformThreatWeight(platform: MobilePlatform): number {
  return platform.platformClass === "ballisticMissile" ? 1.35 : 1;
}

export function buildEnemyIntentBeliefs(
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): EnemyIntentBelief[] {
  return enemyPlatforms
    .filter((platform) => isPlatformDeployed(platform))
    .map((platform) => {
      const rawScores = cities.map((city) => {
        const distanceFactor =
          1 / (1 + distanceKm(platform.position, city.position) / 280);
        const headingFactor = 0.35 + getHeadingAlignment(platform, city);
        const valueFactor = 0.8 + city.value * 0.08;
        const targetBias = platform.targetId === city.id ? 2.4 : 1;
        const rawScore =
          distanceFactor * 1.6 +
          headingFactor * 1.25 +
          valueFactor * 0.55 +
          targetBias;

        return {
          city,
          rawScore,
        };
      });

      const rawTotal = rawScores.reduce((sum, entry) => sum + entry.rawScore, 0);
      const probabilities = rawScores
        .map(({ city, rawScore }) => ({
          cityId: city.id,
          cityName: city.name ?? city.id,
          probability: rawTotal > 0 ? rawScore / rawTotal : 1 / Math.max(1, cities.length),
        }))
        .sort((left, right) => right.probability - left.probability);

      const topProbability = probabilities[0]?.probability ?? 0;
      const secondProbability = probabilities[1]?.probability ?? 0;
      const confidence = clamp(
        topProbability + (topProbability - secondProbability) * 0.9,
        0.35,
        0.98,
      );
      const mostLikelyCity = probabilities[0];
      const expectedThreatScore =
        platform.threatLevel *
        getPlatformThreatWeight(platform) *
        (mostLikelyCity?.probability ?? 0.5) *
        (cities.find((city) => city.id === mostLikelyCity?.cityId)?.value ?? 5);

      return {
        enemyId: platform.id,
        mostLikelyCityId: mostLikelyCity?.cityId ?? platform.targetId ?? "unknown",
        mostLikelyCityName: mostLikelyCity?.cityName ?? platform.targetId ?? "Unknown",
        confidence,
        expectedThreatScore,
        cityProbabilities: probabilities,
      };
    });
}
