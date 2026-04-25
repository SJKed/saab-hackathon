import type { PlatformClass, Team } from "../models/entity";

type SideLossBucket = "allied" | "enemy";
type ObjectiveCategory = "allied-city" | "allied-spawn-zone" | "enemy-base";

const platformValueByTeamAndClass: Record<Team, Record<PlatformClass, number>> = {
  allied: {
    fighterJet: 35_000_000,
    drone: 6_500_000,
    ballisticMissile: 2_300_000,
  },
  enemy: {
    fighterJet: 32_000_000,
    drone: 4_800_000,
    ballisticMissile: 2_000_000,
  },
};

const objectiveValueByCategory: Record<ObjectiveCategory, number> = {
  "allied-city": 900_000_000,
  "allied-spawn-zone": 260_000_000,
  "enemy-base": 310_000_000,
};

export function getPlatformAssetValueUsd(
  team: Team,
  platformClass: PlatformClass,
): number {
  return platformValueByTeamAndClass[team][platformClass];
}

export function getObjectiveAssetValueUsd(category: ObjectiveCategory): number {
  return objectiveValueByCategory[category];
}

export function getCategoryDefaultLossValueUsd(
  category:
    | "allied-city"
    | "allied-spawn-zone"
    | "enemy-base"
    | "allied-platform"
    | "enemy-platform",
): number {
  switch (category) {
    case "allied-city":
    case "allied-spawn-zone":
    case "enemy-base":
      return getObjectiveAssetValueUsd(category);
    case "allied-platform":
      return getPlatformAssetValueUsd("allied", "drone");
    case "enemy-platform":
      return getPlatformAssetValueUsd("enemy", "drone");
    default:
      return 0;
  }
}

export function getLossBucketForCategory(
  category:
    | "allied-city"
    | "allied-spawn-zone"
    | "enemy-base"
    | "allied-platform"
    | "enemy-platform",
): SideLossBucket {
  switch (category) {
    case "allied-city":
    case "allied-spawn-zone":
    case "allied-platform":
      return "allied";
    case "enemy-base":
    case "enemy-platform":
      return "enemy";
    default:
      return "allied";
  }
}
