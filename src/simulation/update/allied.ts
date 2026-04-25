import { getPlatformTransitSpeed } from "../../engine/intercept";
import type { MapBounds } from "../../data/loader";
import { pixelToWorldDistance } from "../../models/distance";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  Vector,
} from "../../models/entity";
import {
  clonePlatform,
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

function getProjectedPointOnSegment(
  point: Vector,
  start: Vector,
  end: Vector,
): Vector {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) {
    return { ...start };
  }

  const projection =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const clampedProjection = clamp(projection, 0.18, 0.82);

  return {
    x: start.x + dx * clampedProjection,
    y: start.y + dy * clampedProjection,
  };
}

function getReconCorridorAnchor(
  platform: MobilePlatform,
  requestedAnchor: Vector,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
): {
  anchor: Vector;
  forwardUnitX: number;
  forwardUnitY: number;
  lateralUnitX: number;
  lateralUnitY: number;
} | null {
  const originBase = alliedSpawnZones.find((base) => base.id === platform.originId);
  const nearestEnemyBase = enemyBases.reduce<EnemyBase | undefined>(
    (bestBase, enemyBase) => {
      if (!bestBase) {
        return enemyBase;
      }

      return Math.hypot(
        requestedAnchor.x - enemyBase.position.x,
        requestedAnchor.y - enemyBase.position.y,
      ) <
        Math.hypot(
          requestedAnchor.x - bestBase.position.x,
          requestedAnchor.y - bestBase.position.y,
        )
        ? enemyBase
        : bestBase;
    },
    undefined,
  );
  if (!originBase || !nearestEnemyBase) {
    return null;
  }

  const corridorAnchor = getProjectedPointOnSegment(
    requestedAnchor,
    originBase.position,
    nearestEnemyBase.position,
  );
  const corridorDx = nearestEnemyBase.position.x - originBase.position.x;
  const corridorDy = nearestEnemyBase.position.y - originBase.position.y;
  const corridorLength = Math.hypot(corridorDx, corridorDy);
  if (corridorLength <= 0.0001) {
    return null;
  }

  const forwardUnitX = corridorDx / corridorLength;
  const forwardUnitY = corridorDy / corridorLength;

  return {
    anchor: corridorAnchor,
    forwardUnitX,
    forwardUnitY,
    lateralUnitX: -forwardUnitY,
    lateralUnitY: forwardUnitX,
  };
}

function getReconPatrolWaypoint(
  platform: MobilePlatform,
  requestedAnchor: Vector,
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
  deltaSeconds: number,
): Vector {
  const patrolRadius = getReconPatrolRadius(platform);
  const stableHash = getStablePlatformHash(platform.id);
  const orbitDirection = stableHash % 2 === 0 ? 1 : -1;
  const seedAngle = ((stableHash % 360) * Math.PI) / 180;
  const corridor = getReconCorridorAnchor(
    platform,
    requestedAnchor,
    alliedSpawnZones,
    enemyBases,
  );
  if (!corridor) {
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

  const alongRadius = patrolRadius;
  const lateralRadius = Math.max(patrolRadius * 0.42, reconPatrolMinRadius * 0.55);
  const relativeX = platform.position.x - corridor.anchor.x;
  const relativeY = platform.position.y - corridor.anchor.y;
  const along =
    relativeX * corridor.forwardUnitX + relativeY * corridor.forwardUnitY;
  const lateral =
    relativeX * corridor.lateralUnitX + relativeY * corridor.lateralUnitY;
  const currentAngle =
    Math.abs(along) > alongRadius * 0.2 || Math.abs(lateral) > lateralRadius * 0.2
      ? Math.atan2(lateral / Math.max(1, lateralRadius), along / Math.max(1, alongRadius))
      : seedAngle;
  const nextAngle =
    currentAngle + orbitDirection * reconPatrolAngularSpeed * deltaSeconds;

  return {
    x:
      corridor.anchor.x +
      corridor.forwardUnitX * Math.cos(nextAngle) * alongRadius +
      corridor.lateralUnitX * Math.sin(nextAngle) * lateralRadius,
    y:
      corridor.anchor.y +
      corridor.forwardUnitY * Math.cos(nextAngle) * alongRadius +
      corridor.lateralUnitY * Math.sin(nextAngle) * lateralRadius,
  };
}

export function updateResourcePositions(
  alliedPlatforms: MobilePlatform[],
  assignments: ResourceAssignment[],
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
  alliedSpawnZones: AlliedSpawnZone[],
  enemyBases: EnemyBase[],
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
      const corridorAnchor =
        getReconCorridorAnchor(
          platform,
          patrolAnchor,
          alliedSpawnZones,
          enemyBases,
        )?.anchor ?? patrolAnchor;
      const patrolRadius = getReconPatrolRadius(platform);
      const distanceToAnchor = Math.hypot(
        platform.position.x - corridorAnchor.x,
        platform.position.y - corridorAnchor.y,
      );
      if (distanceToAnchor > patrolRadius * 0.85) {
        return movePlatformTowards(
          {
            ...platform,
            status: "transit",
            targetId: undefined,
          },
          corridorAnchor,
          minimumDistanceToAssignmentTarget,
          getPlatformTransitSpeed(platform),
          deltaSeconds,
          bounds,
        );
      }

      const patrolWaypoint = getReconPatrolWaypoint(
        platform,
        patrolAnchor,
        alliedSpawnZones,
        enemyBases,
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
