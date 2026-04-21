import type { Base, Enemy, EnemyBase, EnemyPlatform, EnemyType } from "../models/entity";

const minimumDistanceToTarget = 6;

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

function getTargetBase(enemy: Enemy, bases: Base[]): Base | undefined {
  if (enemy.targetId) {
    const matchedTarget = bases.find((base) => base.id === enemy.targetId);
    if (matchedTarget) {
      return matchedTarget;
    }
  }

  let nearestBase: Base | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const base of bases) {
    const currentDistance = distanceSquared(enemy.position, base.position);
    if (currentDistance < nearestDistance) {
      nearestDistance = currentDistance;
      nearestBase = base;
    }
  }

  return nearestBase;
}

export function createEnemyDeployments(enemyBases: EnemyBase[], bases: Base[]): Enemy[] {
  if (enemyBases.length === 0 || bases.length === 0) {
    return [];
  }

  return enemyBases.flatMap((enemyBase, enemyBaseIndex) =>
    deploymentPlans.map((plan, planIndex) => {
      const targetBase = bases[(enemyBaseIndex + planIndex) % bases.length];
      const offsetAngle =
        (Math.PI * 2 * planIndex) / deploymentPlans.length + enemyBaseIndex * 0.55;
      const offsetRadius = 18;
      const position = {
        x: enemyBase.position.x + Math.cos(offsetAngle) * offsetRadius,
        y: enemyBase.position.y + Math.sin(offsetAngle) * offsetRadius,
      };

      return {
        id: `${enemyBase.id}-${plan.platform}-${planIndex + 1}`,
        name: `${enemyBase.id} ${plan.label}`,
        position,
        velocity: { x: 0, y: 0 },
        type: plan.type,
        platform: plan.platform,
        threatLevel: plan.threatLevel,
        originBaseId: enemyBase.id,
        targetId: targetBase.id,
      };
    }),
  );
}

export function updateEnemyPositions(enemies: Enemy[], bases: Base[], deltaSeconds: number): Enemy[] {
  if (bases.length === 0 || deltaSeconds <= 0) {
    return enemies;
  }

  return enemies.map((enemy) => {
    const targetBase = getTargetBase(enemy, bases);
    if (!targetBase) {
      return enemy;
    }

    const dx = targetBase.position.x - enemy.position.x;
    const dy = targetBase.position.y - enemy.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= minimumDistanceToTarget) {
      return {
        ...enemy,
        targetId: targetBase.id,
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
      targetId: targetBase.id,
      velocity,
      position: {
        x: enemy.position.x + directionX * movementStep,
        y: enemy.position.y + directionY * movementStep,
      },
    };
  });
}
