import type { ResourceAssignment } from "../allocation";
import type { AlliedForcePostureSnapshot } from "../posture";
import type {
  PlannerActionCandidate,
  ResponsePlannerResult,
  ResponsePlannerSnapshot,
} from "./types";

type PortfolioState = {
  selected: PlannerActionCandidate[];
  usedResourceIds: Set<string>;
  interceptCountByTarget: Map<string, number>;
  reinforceCountByTarget: Map<string, number>;
  score: number;
};

const beamWidth = 8;

function getIncrementalPenalty(
  state: PortfolioState,
  candidate: PlannerActionCandidate,
  postureSnapshot: AlliedForcePostureSnapshot,
): number {
  if (candidate.mission === "intercept") {
    const currentFighterInterceptsOnTarget = state.selected.filter(
      (selectedCandidate) =>
        selectedCandidate.mission === "intercept" &&
        selectedCandidate.targetId === candidate.targetId &&
        selectedCandidate.sourcePlatform.platformClass === "fighterJet",
    ).length;
    if (
      candidate.targetPlatformClass === "drone" &&
      candidate.sourcePlatform.platformClass === "fighterJet" &&
      currentFighterInterceptsOnTarget >= 1
    ) {
      return 100;
    }

    const currentCount = state.interceptCountByTarget.get(candidate.targetId) ?? 0;
    if (currentCount >= 2) {
      return 5.5 + currentCount * 1.5;
    }

    if (currentCount === 1) {
      return 1.4;
    }

    return 0;
  }

  if (candidate.mission === "reinforce") {
    const currentCount = state.reinforceCountByTarget.get(candidate.targetId) ?? 0;
    const unmetCoverage =
      postureSnapshot.cityStates.find((entry) => entry.cityId === candidate.targetId)
        ?.unmetCoverage ?? 0;
    const allowedStack =
      unmetCoverage >= 2.4 ? 2 : unmetCoverage >= 1.2 ? 1 : postureSnapshot.stance === "surging" ? 1 : 0;

    return currentCount >= allowedStack ? 3.8 + currentCount * 1.2 : 0;
  }

  return 0;
}

function toAssignment(candidate: PlannerActionCandidate): ResourceAssignment {
  return {
    mission: candidate.mission === "intercept" ? "intercept" : "reinforce",
    resourceId: candidate.resourceId,
    resourceName: candidate.resourceName,
    targetId: candidate.targetId,
    targetName: candidate.targetName,
    distance: candidate.distance,
    interceptTimeSeconds: candidate.interceptTimeSeconds,
    threatScore: candidate.expectedDamagePrevented,
    priorityScore: candidate.baseScore,
    expectedEffectiveness: candidate.expectedDamagePrevented,
    reason: candidate.rationale,
  };
}

export function runPortfolioPlanner(input: {
  candidates: PlannerActionCandidate[];
  postureSnapshot: AlliedForcePostureSnapshot;
}): ResponsePlannerResult | undefined {
  if (input.candidates.length === 0) {
    return undefined;
  }

  let beam: PortfolioState[] = [
    {
      selected: [],
      usedResourceIds: new Set<string>(),
      interceptCountByTarget: new Map<string, number>(),
      reinforceCountByTarget: new Map<string, number>(),
      score: 0,
    },
  ];

  for (const candidate of input.candidates) {
    const nextBeam: PortfolioState[] = [];

    for (const state of beam) {
      nextBeam.push(state);

      if (state.usedResourceIds.has(candidate.resourceId)) {
        continue;
      }

      const penalty = getIncrementalPenalty(state, candidate, input.postureSnapshot);
      const interceptCountByTarget = new Map(state.interceptCountByTarget);
      const reinforceCountByTarget = new Map(state.reinforceCountByTarget);
      if (candidate.mission === "intercept") {
        interceptCountByTarget.set(
          candidate.targetId,
          (interceptCountByTarget.get(candidate.targetId) ?? 0) + 1,
        );
      } else if (candidate.mission === "reinforce") {
        reinforceCountByTarget.set(
          candidate.targetId,
          (reinforceCountByTarget.get(candidate.targetId) ?? 0) + 1,
        );
      }

      nextBeam.push({
        selected: [...state.selected, candidate],
        usedResourceIds: new Set(state.usedResourceIds).add(candidate.resourceId),
        interceptCountByTarget,
        reinforceCountByTarget,
        score: state.score + candidate.baseScore - penalty,
      });
    }

    nextBeam.sort((left, right) => right.score - left.score);
    beam = nextBeam.slice(0, beamWidth);
  }

  const bestState = beam[0];
  if (!bestState || bestState.selected.length === 0) {
    return undefined;
  }

  const assignments = bestState.selected.map(toAssignment);
  const plannerSnapshot: ResponsePlannerSnapshot = {
    mode: "portfolio-beam",
    objectiveScore: bestState.score,
    consideredActionCount: input.candidates.length,
    selectedActionCount: assignments.length,
    primaryRationale:
      bestState.selected[0]?.rationale ??
      "The planner found no stronger bundle than the selected action set.",
    beliefSummaries: [],
    alternativeSummary:
      input.candidates.length > assignments.length
        ? `${input.candidates.length - assignments.length} lower-value actions were rejected to preserve portfolio quality.`
        : undefined,
  };

  return {
    assignments,
    snapshot: plannerSnapshot,
  };
}
