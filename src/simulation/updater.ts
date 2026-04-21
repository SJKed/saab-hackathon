import type {
  AlliedCity,
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
    return 125;
  }

  if (enemy.platform === "drone") {
    return 82;
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

function getResourceAssignmentTarget(
  resource: Resource,
  assignment: ResourceAssignment,
  cities: AlliedCity[],
  enemies: Enemy[],
): Vector | undefined {
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
      };
    }),
  );
}

export function updateEnemyPositions(
  enemies: Enemy[],
  cities: AlliedCity[],
  deltaSeconds: number,
): Enemy[] {
  if (cities.length === 0 || deltaSeconds <= 0) {
    return enemies;
  }

  return enemies.map((enemy) => {
    if (enemy.engagedWithId) {
      return {
        ...enemy,
        velocity: { x: 0, y: 0 },
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

    const directionX = dx / distance;
    const directionY = dy / distance;
    const speed = getEnemySpeed(enemy);
    const movementStep = Math.min(speed * deltaSeconds, distance - minimumDistanceToTarget);

    const velocity = {
      x: directionX * speed,
      y: directionY * speed,
    };

    return {
      ...enemy,
      targetId: targetCity.id,
      velocity,
      position: {
        x: enemy.position.x + directionX * movementStep,
        y: enemy.position.y + directionY * movementStep,
      },
    };
  });
}

export function updateResourcePositions(
  resources: Resource[],
  assignments: ResourceAssignment[],
  cities: AlliedCity[],
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
      };
    }

    const targetPosition = getResourceAssignmentTarget(
      resource,
      assignment,
      cities,
      enemies,
    );
    if (!targetPosition) {
      return {
        ...resource,
        available: true,
        velocity: { x: 0, y: 0 },
      };
    }

    const dx = targetPosition.x - resource.position.x;
    const dy = targetPosition.y - resource.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= minimumDistanceToResourceTarget) {
      return {
        ...resource,
        available: false,
        velocity: { x: 0, y: 0 },
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
