import { getPlatformTransitSpeed } from "../../engine/intercept";
import type { MapBounds } from "../../data/loader";
import type {
  AlliedCity,
  AlliedSpawnZone,
  MobilePlatform,
} from "../../models/entity";
import {
  clonePlatform,
  isPlatformStored,
} from "../../models/platform-utils";
import type { ResourceAssignment } from "../../engine/allocation";
import {
  applyPassiveStateUpdates,
  hasRemainingAmmo,
  maneuverAgainstTarget,
  minimumDistanceToAssignmentTarget,
  movePlatformTowards,
  routePlatformToClosestBase,
  transitionCombatPhase,
} from "./shared";
import { getAssignmentTarget } from "./targeting";

export function updateResourcePositions(
  alliedPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
  alliedSpawnZones: AlliedSpawnZone[],
  deltaSeconds: number,
  bounds: MapBounds,
): MobilePlatform[] {
  if (deltaSeconds <= 0) {
    return alliedPlatforms.map(clonePlatform);
  }

  return alliedPlatforms.map((currentPlatform) => {
    const platform = applyPassiveStateUpdates(
      clonePlatform(currentPlatform),
      alliedSpawnZones,
      [],
      deltaSeconds,
    );

    if (platform.status === "destroyed") {
      return platform;
    }

    if (isPlatformStored(platform)) {
      const assignment = assignments.find(
        (item) => item.resourceId === platform.id,
      );
      if (!assignment) {
        return {
          ...platform,
          velocity: { x: 0, y: 0 },
        };
      }

      const targetPosition = getAssignmentTarget(
        platform,
        assignment,
        cities,
        enemyPlatforms,
      );
      if (!targetPosition) {
        return {
          ...platform,
          velocity: { x: 0, y: 0 },
        };
      }

      return movePlatformTowards(
        {
          ...platform,
          status:
            assignment.mission === "intercept"
              ? "intercepting"
              : "reinforcing",
          targetId: assignment.targetId,
          deploymentDelaySeconds: 0,
        },
        targetPosition,
        minimumDistanceToAssignmentTarget,
        getPlatformTransitSpeed(platform),
        deltaSeconds,
        bounds,
      );
    }

    if (platform.engagedWithId) {
      const engagedTarget = enemyPlatforms.find(
        (enemyPlatform) => enemyPlatform.id === platform.engagedWithId,
      );
      if (engagedTarget) {
        return maneuverAgainstTarget(platform, engagedTarget, deltaSeconds, bounds);
      }

      return transitionCombatPhase(
        {
          ...platform,
          status: "idle",
          velocity: { x: 0, y: 0 },
        },
        undefined,
        {
          engagedWithId: undefined,
        },
      );
    }

    if (platform.status === "returning") {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    if (!hasRemainingAmmo(platform) && !platform.oneWay) {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    const assignment = assignments.find((item) => item.resourceId === platform.id);
    if (!assignment) {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    const targetPosition = getAssignmentTarget(
      platform,
      assignment,
      cities,
      enemyPlatforms,
    );
    if (!targetPosition) {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    return movePlatformTowards(
      {
        ...platform,
        status:
          assignment.mission === "intercept" ? "intercepting" : "reinforcing",
        targetId: assignment.targetId,
      },
      targetPosition,
      minimumDistanceToAssignmentTarget,
      getPlatformTransitSpeed(platform),
      deltaSeconds,
      bounds,
    );
  });
}
