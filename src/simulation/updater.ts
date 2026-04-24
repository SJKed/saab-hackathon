import type {
  AlliedCity,
  AlliedSpawnZone,
  Enemy,
  EnemyBase,
  EnemyPlatform,
  EnemyType,
  Resource,
  Vector,
} from "../models/entity";
import type { ResourceAssignment } from "../engine/allocation";
import { getScaledResourceSpeed, predictIntercept } from "../engine/intercept";

const minimumDistanceToTarget = 6;
const minimumDistanceToResourceTarget = 10;
const enemySupportRadius = 140;
const aircraftConservationWeight = 1;
const droneConservationWeight = 0.5;
const ordnanceConservationWeight = 0.25;

type DeploymentPlan = {
  platform: EnemyPlatform;
  type: EnemyType;
  threatLevel: number;
  label: string;
};

const deploymentPlans: DeploymentPlan[] = [
  {
    platform: "airplane",
    type: "attacker",
    threatLevel: 0.85,
    label: "Aircraft",
  },
  {
    platform: "drone",
    type: "recon",
    threatLevel: 0.45,
    label: "Drone",
  },
];

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function getEnemySpeed(enemy: Enemy): number {
  if (enemy.platform === "airplane") {
    return 70;
  }

  if (enemy.platform === "drone") {
    return 35;
  }

  switch (enemy.type) {
    case "attacker":
      return 70;
    case "flanker":
      return 85;
    case "recon":
      return 100;
    default:
      return 70;
  }
}

function getTargetCity(enemy: Enemy, cities: AlliedCity[]): AlliedCity | undefined {
  if (enemy.targetId) {
    const matchedTarget = cities.find((city) => city.id === enemy.targetId);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  let nearestCity: AlliedCity | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const currentDistance = distanceSquared(enemy.position, city.position);
    if (currentDistance < nearestDistance) {
      nearestDistance = currentDistance;
      nearestCity = city;
    }
  }

  return nearestCity;
}

function getEnemyBaseById(enemy: Enemy, enemyBases: EnemyBase[]): EnemyBase | undefined {
  if (!enemy.originBaseId) {
    return undefined;
  }
  return enemyBases.find((base) => base.id === enemy.originBaseId);
}

function hasNearbyEngagedAlly(enemy: Enemy, allies: Enemy[]): boolean {
  return allies.some((ally) => {
    if (ally.id === enemy.id || !ally.engagedWithId || ally.health <= 0) {
      return false;
    }
    return Math.hypot(
      ally.position.x - enemy.position.x,
      ally.position.y - enemy.position.y,
    ) <= enemySupportRadius;
  });
}

function moveToward(
  enemy: Enemy,
  targetPosition: Vector,
  speed: number,
  deltaSeconds: number,
): Enemy {
  const dx = targetPosition.x - enemy.position.x;
  const dy = targetPosition.y - enemy.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= minimumDistanceToTarget) {
    return { ...enemy, velocity: { x: 0, y: 0 } };
  }
  const directionX = dx / distance;
  const directionY = dy / distance;
  const movementStep = Math.min(speed * deltaSeconds, distance - minimumDistanceToTarget);
  return {
    ...enemy,
    velocity: { x: directionX * speed, y: directionY * speed },
    position: {
      x: enemy.position.x + directionX * movementStep,
      y: enemy.position.y + directionY * movementStep,
    },
  };
}

function shouldConserveUnit(enemy: Enemy, resources: Resource[]): boolean {
  const nearestResourceDistance = resources.reduce((closest, resource) => {
    const distance = Math.hypot(
      resource.position.x - enemy.position.x,
      resource.position.y - enemy.position.y,
    );
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);
  const healthRatio = enemy.health / Math.max(1, enemy.platform === "airplane" ? 118 : 82);
  const unitWeight = enemy.platform === "airplane" ? aircraftConservationWeight : droneConservationWeight;
  const riskScore = unitWeight * (1 - healthRatio) + 120 / Math.max(20, nearestResourceDistance);
  return riskScore > (enemy.platform === "airplane" ? 1.05 : 1.35);
}

function getResourceAssignmentTarget(
  resource: Resource,
  assignment: ResourceAssignment,
  cities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  enemies: Enemy[],
): Vector | undefined {
  if (assignment.mission === "reload") {
    return alliedSpawnZones.find((base) => base.id === assignment.targetId)?.position;
  }

  if (assignment.mission === "intercept") {
    const enemy = enemies.find((item) => item.id === assignment.targetId);
    if (!enemy) {
      return undefined;
    }

    return predictIntercept(resource, enemy, cities)?.point ?? enemy.position;
  }

  return cities.find((city) => city.id === assignment.targetId)?.position;
}

export function createEnemyDeployments(
  enemyBases: EnemyBase[],
  cities: AlliedCity[],
): Enemy[] {
  if (enemyBases.length === 0 || cities.length === 0) {
    return [];
  }

  return enemyBases.flatMap((enemyBase, enemyBaseIndex) =>
    deploymentPlans.map((plan, planIndex) => {
      const targetCity = cities[(enemyBaseIndex + planIndex) % cities.length];
      const offsetAngle =
        (Math.PI * 2 * planIndex) / deploymentPlans.length + enemyBaseIndex * 0.55;
      const offsetRadius = 18;
      const position = {
        x: enemyBase.position.x + Math.cos(offsetAngle) * offsetRadius,
        y: enemyBase.position.y + Math.sin(offsetAngle) * offsetRadius,
      };
      const attack = plan.platform === "airplane" ? 58 : 36;
      const defense = plan.platform === "airplane" ? 40 : 30;
      const health = plan.platform === "airplane" ? 118 : 82;

      return {
        id: `${enemyBase.id}-${plan.platform}-${planIndex + 1}`,
        name: `${enemyBase.id} ${plan.label}`,
        position,
        velocity: { x: 0, y: 0 },
        engagedWithId: undefined,
        type: plan.type,
        platform: plan.platform,
        threatLevel: plan.threatLevel,
        originBaseId: enemyBase.id,
        targetId: targetCity.id,
        attack,
        defense,
        health,
        ordnance: plan.platform === "airplane" ? 14 : 12,
        maxOrdnance: plan.platform === "airplane" ? 14 : 12,
        ordnanceRange: plan.platform === "airplane" ? 150 : 130,
        ordnanceSpeed: plan.platform === "airplane" ? 340 : 300,
        interceptChance: plan.platform === "airplane" ? 0.2 : 0.26,
      };
    }),
  );
}

export function updateEnemyPositions(
  enemies: Enemy[],
  enemyBases: EnemyBase[],
  cities: AlliedCity[],
  resources: Resource[],
  deltaSeconds: number,
): Enemy[] {
  if (cities.length === 0 || deltaSeconds <= 0) {
    return enemies;
  }

  return enemies.map((enemy, _, allEnemies) => {
    if (enemy.engagedWithId) {
      return {
        ...enemy,
        velocity: { x: 0, y: 0 },
      };
    }

    const speed = getEnemySpeed(enemy);
    const originBase = getEnemyBaseById(enemy, enemyBases);
    const nearbyEngagedAlly = hasNearbyEngagedAlly(enemy, allEnemies);

    if (enemy.ordnance <= 0) {
      if (originBase) {
        if (enemy.platform === "airplane" && nearbyEngagedAlly) {
          const engagedAlly = allEnemies.find(
            (ally) =>
              ally.id !== enemy.id &&
              !!ally.engagedWithId &&
              Math.hypot(
                ally.position.x - enemy.position.x,
                ally.position.y - enemy.position.y,
              ) <= enemySupportRadius,
          );
          if (engagedAlly) {
            return {
              ...moveToward(enemy, engagedAlly.position, speed, deltaSeconds),
              behaviorState: "cover",
            };
          }
        }

        const returning = moveToward(enemy, originBase.position, speed, deltaSeconds);
        const baseDistance = Math.hypot(
          returning.position.x - originBase.position.x,
          returning.position.y - originBase.position.y,
        );
        if (baseDistance <= minimumDistanceToTarget) {
          return {
            ...returning,
            ordnance: returning.maxOrdnance,
            behaviorState: "reload-complete",
            velocity: { x: 0, y: 0 },
          };
        }
        return {
          ...returning,
          behaviorState: "reload",
        };
      }
      return {
        ...enemy,
        velocity: { x: 0, y: 0 },
        behaviorState: "reload",
      };
    }

    const targetCity = getTargetCity(enemy, cities);
    if (!targetCity) {
      return enemy;
    }

    const dx = targetCity.position.x - enemy.position.x;
    const dy = targetCity.position.y - enemy.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= minimumDistanceToTarget) {
      return {
        ...enemy,
        targetId: targetCity.id,
        velocity: { x: 0, y: 0 },
      };
    }

    const conserveWeight = enemy.platform === "airplane" ? aircraftConservationWeight : droneConservationWeight;
    const ordnancePressure = (1 - enemy.ordnance / Math.max(1, enemy.maxOrdnance)) * ordnanceConservationWeight;
    const shouldConserve = shouldConserveUnit(enemy, resources) && conserveWeight + ordnancePressure > 1;

    if (shouldConserve && originBase) {
      return {
        ...moveToward(enemy, originBase.position, speed, deltaSeconds),
        behaviorState: "reload",
      };
    }

    return {
      ...moveToward(enemy, targetCity.position, speed, deltaSeconds),
      targetId: targetCity.id,
      behaviorState: "attack",
    };
  });
}

export function updateResourcePositions(
  resources: Resource[],
  assignments: ResourceAssignment[],
  cities: AlliedCity[],
  alliedSpawnZones: AlliedSpawnZone[],
  enemies: Enemy[],
  deltaSeconds: number,
): Resource[] {
  if (deltaSeconds <= 0) {
    return resources;
  }

  return resources.map((resource) => {
    if (resource.engagedWithId) {
      return {
        ...resource,
        available: false,
        velocity: { x: 0, y: 0 },
      };
    }

    const assignment = assignments.find((item) => item.resourceId === resource.id);
    if (!assignment) {
      return {
        ...resource,
        available: true,
        velocity: { x: 0, y: 0 },
        reloadTargetBaseId: undefined,
      };
    }

    const targetPosition = getResourceAssignmentTarget(
      resource,
      assignment,
      cities,
      alliedSpawnZones,
      enemies,
    );
    if (!targetPosition) {
      return {
        ...resource,
        available: true,
        velocity: { x: 0, y: 0 },
        reloadTargetBaseId: undefined,
      };
    }

    const dx = targetPosition.x - resource.position.x;
    const dy = targetPosition.y - resource.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= minimumDistanceToResourceTarget) {
      const didReachReloadBase = assignment.mission === "reload";
      return {
        ...resource,
        available: !didReachReloadBase,
        velocity: { x: 0, y: 0 },
        ordnance: didReachReloadBase ? resource.maxOrdnance : resource.ordnance,
        reloadTargetBaseId: didReachReloadBase ? undefined : assignment.targetId,
      };
    }

    const directionX = dx / distance;
    const directionY = dy / distance;
    const speed = getScaledResourceSpeed(resource);
    const movementStep = Math.min(
      speed * deltaSeconds,
      distance - minimumDistanceToResourceTarget,
    );

    return {
      ...resource,
      available: false,
      reloadTargetBaseId:
        assignment.mission === "reload" ? assignment.targetId : resource.reloadTargetBaseId,
      velocity: {
        x: directionX * speed,
        y: directionY * speed,
      },
      position: {
        x: resource.position.x + directionX * movementStep,
        y: resource.position.y + directionY * movementStep,
      },
    };
  });
}
