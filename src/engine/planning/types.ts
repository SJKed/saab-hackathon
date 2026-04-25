import type { AlliedCity, MobilePlatform } from "../../models/entity";
import type { ResourceAssignment } from "../allocation";

export type PlannerMission = "intercept" | "reinforce" | "hold";

export type EnemyIntentBelief = {
  enemyId: string;
  mostLikelyCityId: string;
  mostLikelyCityName: string;
  confidence: number;
  expectedThreatScore: number;
  cityProbabilities: Array<{
    cityId: string;
    cityName: string;
    probability: number;
  }>;
};

export type PlannerActionCandidate = {
  id: string;
  mission: PlannerMission;
  resourceId: string;
  resourceName: string;
  targetId: string;
  targetName: string;
  distance: number;
  interceptTimeSeconds?: number;
  confidence: number;
  expectedDamagePrevented: number;
  expectedMissionCost: number;
  expectedNetValue: number;
  reserveValuePreserved: number;
  switchingCost: number;
  scarcityCost: number;
  baseScore: number;
  rationale: string;
  sourcePlatform: MobilePlatform;
  targetCity?: AlliedCity;
};

export type ResponsePlannerSnapshot = {
  mode: "portfolio-beam" | "heuristic-fallback";
  objectiveScore: number;
  consideredActionCount: number;
  selectedActionCount: number;
  primaryRationale: string;
  beliefSummaries: Array<{
    enemyId: string;
    targetName: string;
    confidence: number;
  }>;
  alternativeSummary?: string;
};

export type ResponsePlannerResult = {
  assignments: ResourceAssignment[];
  snapshot: ResponsePlannerSnapshot;
};
