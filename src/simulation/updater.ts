import type { Base, Enemy } from "../models/entity";

const minimumDistanceToTarget = 6;

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function getEnemySpeed(enemy: Enemy): number {
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
