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
  isAlliedBaseDeploymentDisabled,
  type DebugSettings,
} from "../../models/debug";
import {
  applyPassiveStateUpdates,
  hasRemainingAmmo,
  maneuverAgainstTarget,
  minimumDistanceToAssignmentTarget,
  movePlatformTowards,
  routePlatformToClosestBase,
  transitionCombatPhase,
} from "./shared";
import {
  getAssignmentTarget,
  getLockedBallisticMissileTarget,
} from "./targeting";

export function updateResourcePositions(
  alliedPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
  alliedSpawnZones: AlliedSpawnZone[],
  deltaSeconds: number,
  bounds: MapBounds,
  debugSettings: DebugSettings,
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
      debugSettings.fuelBurnMultiplier,
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

      if (isAlliedBaseDeploymentDisabled(debugSettings, platform.originId)) {
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

    const lockedBallisticMissileTarget = getLockedBallisticMissileTarget(
      platform,
      cities,
      enemyPlatforms,
    );

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

    if (!hasRemainingAmmo(platform)) {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    const assignment = assignments.find((item) => item.resourceId === platform.id);
    if (!assignment && !lockedBallisticMissileTarget) {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    const targetPosition =
      lockedBallisticMissileTarget ??
      (assignment
        ? getAssignmentTarget(
            platform,
            assignment,
            cities,
            enemyPlatforms,
          )
        : undefined);
    if (!targetPosition) {
      return routePlatformToClosestBase(platform, alliedSpawnZones, [], deltaSeconds, bounds);
    }

    const lockedBallisticMissileMission =
      platform.platformClass === "ballisticMissile" && platform.targetId
        ? cities.some((city) => city.id === platform.targetId)
          ? "reinforce"
          : "intercept"
        : undefined;

    return movePlatformTowards(
      {
        ...platform,
        status:
          (lockedBallisticMissileMission ?? assignment?.mission) === "reinforce"
            ? "reinforcing"
            : "intercepting",
        targetId:
          platform.platformClass === "ballisticMissile" && platform.targetId
            ? platform.targetId
            : assignment?.targetId,
      },
      targetPosition,
      minimumDistanceToAssignmentTarget,
      getPlatformTransitSpeed(platform),
      deltaSeconds,
      bounds,
    );
  });
}
