import { getPlatformTransitSpeed } from "../../engine/intercept";
import type { MapBounds } from "../../data/loader";
import { pixelToWorldDistance } from "../../models/distance";
import type {
  AlliedCity,
  AlliedSpawnZone,
  MobilePlatform,
  Vector,
} from "../../models/entity";
import {
  canReconPlatformEngageTarget,
  clonePlatform,
  getPlatformTargetType,
  isReconPlatform,
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

const reconPatrolMinRadius = pixelToWorldDistance(20);
const reconPatrolMaxRadius = pixelToWorldDistance(80);
const reconPatrolRadiusFraction = 0.32;
const reconPatrolAngularSpeed = Math.PI / 9;
const reconPatrolWaypointTolerance = minimumDistanceToAssignmentTarget * 0.35;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getStablePlatformHash(platformId: string): number {
  let hash = 0;
  for (const character of platformId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function getReconPatrolRadius(platform: MobilePlatform): number {
  return clamp(
    platform.sensors.sensorRange * reconPatrolRadiusFraction,
    reconPatrolMinRadius,
    reconPatrolMaxRadius,
  );
}

function getMaxReconPatrolRadiusForAnchor(
  anchor: Vector,
  bounds: MapBounds,
): number {
  return Math.max(
    0,
    Math.min(
      anchor.x - (bounds.minX + 8),
      bounds.maxX - 8 - anchor.x,
      anchor.y - (bounds.minY + 8),
      bounds.maxY - 8 - anchor.y,
    ),
  );
}

function getReconPatrolWaypoint(
  platform: MobilePlatform,
  requestedAnchor: Vector,
  bounds: MapBounds,
  deltaSeconds: number,
): Vector {
  const patrolRadius = Math.min(
    getReconPatrolRadius(platform),
    getMaxReconPatrolRadiusForAnchor(requestedAnchor, bounds),
  );
  if (patrolRadius <= reconPatrolWaypointTolerance) {
    return { ...requestedAnchor };
  }

  const stableHash = getStablePlatformHash(platform.id);
  const orbitDirection = stableHash % 2 === 0 ? 1 : -1;
  const seedAngle = ((stableHash % 360) * Math.PI) / 180;
  const dx = platform.position.x - requestedAnchor.x;
  const dy = platform.position.y - requestedAnchor.y;
  const distanceFromAnchor = Math.hypot(dx, dy);
  const currentAngle =
    distanceFromAnchor > patrolRadius * 0.35
      ? Math.atan2(dy, dx)
      : seedAngle;
  const nextAngle =
    currentAngle + orbitDirection * reconPatrolAngularSpeed * deltaSeconds;

  return {
    x: requestedAnchor.x + Math.cos(nextAngle) * patrolRadius,
    y: requestedAnchor.y + Math.sin(nextAngle) * patrolRadius,
  };
}

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
              : assignment.mission === "recon"
                ? "transit"
                : "reinforcing",
          targetId: assignment.mission === "recon" ? undefined : assignment.targetId,
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
        if (
          isReconPlatform(platform) &&
          !canReconPlatformEngageTarget(
            platform,
            getPlatformTargetType(engagedTarget),
          )
        ) {
          return transitionCombatPhase(
            {
              ...platform,
              status: "transit",
              velocity: { x: 0, y: 0 },
            },
            undefined,
            {
              engagedWithId: undefined,
              disengageReason: "Recon drone avoiding non-missile combat",
            },
          );
        }

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

    if (assignment?.mission === "recon" && isReconPlatform(platform)) {
      const patrolAnchor = targetPosition;
      const patrolRadius = getReconPatrolRadius(platform);
      const distanceToAnchor = Math.hypot(
        platform.position.x - patrolAnchor.x,
        platform.position.y - patrolAnchor.y,
      );
      if (distanceToAnchor > patrolRadius * 0.85) {
        return movePlatformTowards(
          {
            ...platform,
            status: "transit",
            targetId: undefined,
          },
          patrolAnchor,
          minimumDistanceToAssignmentTarget,
          getPlatformTransitSpeed(platform),
          deltaSeconds,
          bounds,
        );
      }

      const patrolWaypoint = getReconPatrolWaypoint(
        platform,
        patrolAnchor,
        bounds,
        deltaSeconds,
      );
      const movedPlatform = movePlatformTowards(
        {
          ...platform,
          status: "transit",
          targetId: undefined,
        },
        patrolWaypoint,
        reconPatrolWaypointTolerance,
        getPlatformTransitSpeed(platform),
        deltaSeconds,
        bounds,
      );
      return movedPlatform;
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
