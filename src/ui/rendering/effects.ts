import type { CombatLogEvent } from "../../engine/combat";
import {
  alliedEffectColor,
  enemyEffectColor,
  neutralEffectColor,
} from "./constants";
import { clamp, hexToRgba } from "./shared";
import type { CombatVisualEffect } from "./types";

function getEffectDurationMs(kind: CombatVisualEffect["kind"]): number {
  switch (kind) {
    case "tracer":
      return 180;
    case "missileTrail":
      return 260;
    case "impactRing":
      return 320;
    case "strikeBurst":
      return 360;
    case "floatingText":
      return 780;
    default:
      return 320;
  }
}

const missTextColor = "#f5f5f5";
const hitTextColor = "#ffb703";
const critTextColor = "#ff5252";
const killTextColor = "#ff4d6d";

function getEventEffectColor(event: CombatLogEvent): string {
  if (event.source?.category?.startsWith("allied")) {
    return alliedEffectColor;
  }

  if (event.source?.category?.startsWith("enemy")) {
    return enemyEffectColor;
  }

  return neutralEffectColor;
}

function createCombatEffect(
  id: string,
  kind: CombatVisualEffect["kind"],
  event: CombatLogEvent,
  createdAtMs: number,
  intensity = 1,
): CombatVisualEffect | null {
  if (!event.targetPosition && !event.sourcePosition) {
    return null;
  }

  const start = event.sourcePosition ?? event.targetPosition;
  const end = event.targetPosition ?? event.sourcePosition;
  if (!start || !end) {
    return null;
  }

  return {
    id,
    kind,
    sourceId: event.source?.id,
    targetId: event.target?.id ?? event.destroyedUnit?.id,
    start: { ...start },
    end: { ...end },
    color: getEventEffectColor(event),
    createdAtMs,
    durationMs: getEffectDurationMs(kind),
    weaponClass: event.weaponClass,
    intensity,
  };
}

function createFloatingTextEffect(
  id: string,
  event: CombatLogEvent,
  createdAtMs: number,
  text: string,
  color: string,
  intensity = 1,
): CombatVisualEffect | null {
  if (!event.targetPosition) {
    return null;
  }

  return {
    id,
    kind: "floatingText",
    sourceId: event.source?.id,
    targetId: event.target?.id ?? event.destroyedUnit?.id,
    start: { ...event.targetPosition },
    end: { ...event.targetPosition },
    color,
    createdAtMs,
    durationMs: getEffectDurationMs("floatingText"),
    weaponClass: event.weaponClass,
    intensity,
    text,
  };
}

function getEventTargetKey(event: CombatLogEvent): string | undefined {
  if (event.target?.id) {
    return event.target.id;
  }

  if (event.destroyedUnit?.id) {
    return event.destroyedUnit.id;
  }

  if (event.targetPosition) {
    return `${Math.round(event.targetPosition.x)}:${Math.round(event.targetPosition.y)}`;
  }

  return undefined;
}

export function mapCombatEventsToEffects(
  events: CombatLogEvent[],
  createdAtMs: number,
): CombatVisualEffect[] {
  const effects: CombatVisualEffect[] = [];
  const engagementTargets = new Set<string>();

  for (const event of events) {
    if (event.kind === "engagement") {
      const targetKey = getEventTargetKey(event);
      if (targetKey) {
        engagementTargets.add(targetKey);
      }
      const isMiss = event.outcome === "miss";
      const isCritical = event.outcome === "critical";
      const roundedDamage = Math.max(0, Math.round(event.inflictedToTarget ?? 0));
      const floatingText = createFloatingTextEffect(
        `${event.id}-text`,
        event,
        createdAtMs,
        isMiss
          ? "MISS"
          : isCritical
            ? `CRIT -${roundedDamage}`
            : `HIT -${roundedDamage}`,
        isMiss ? missTextColor : isCritical ? critTextColor : hitTextColor,
        isMiss ? 0.95 : isCritical ? 1.18 : 1,
      );
      if (floatingText) {
        effects.push(floatingText);
      }

      if (event.weaponClass === "rapidFire") {
        const tracer = createCombatEffect(
          `${event.id}-tracer`,
          "tracer",
          event,
          createdAtMs,
          0.8,
        );
        if (tracer) {
          effects.push(tracer);
        }
        if (!isMiss) {
          const impact = createCombatEffect(
            `${event.id}-impact`,
            "impactRing",
            event,
            createdAtMs,
            isCritical ? 1.25 : 0.82,
          );
          if (impact) {
            effects.push(impact);
          }
        }
        if (isCritical) {
          const burst = createCombatEffect(
            `${event.id}-burst`,
            "strikeBurst",
            event,
            createdAtMs,
            1.05,
          );
          if (burst) {
            effects.push(burst);
          }
        }
        continue;
      }

      if (event.weaponClass === "airToAirMissile") {
        const trail = createCombatEffect(
          `${event.id}-trail`,
          "missileTrail",
          event,
          createdAtMs,
          isMiss ? 0.72 : isCritical ? 1.18 : 1,
        );
        if (trail) {
          effects.push(trail);
        }
        if (!isMiss) {
          const impact = createCombatEffect(
            `${event.id}-impact`,
            "impactRing",
            event,
            createdAtMs,
            isCritical ? 1.6 : 1.1,
          );
          if (impact) {
            effects.push(impact);
          }
        }
        if (isCritical) {
          const burst = createCombatEffect(
            `${event.id}-burst`,
            "strikeBurst",
            event,
            createdAtMs,
            1.35,
          );
          if (burst) {
            effects.push(burst);
          }
        }
        continue;
      }

      if (event.weaponClass === "bomb" || event.weaponClass === "terminalPayload") {
        if (!isMiss) {
          const burst = createCombatEffect(
            `${event.id}-burst`,
            "strikeBurst",
            event,
            createdAtMs,
            event.weaponClass === "terminalPayload"
              ? isCritical
                ? 1.7
                : 1.4
              : isCritical
                ? 1.55
                : 1.25,
          );
          const impact = createCombatEffect(
            `${event.id}-impact`,
            "impactRing",
            event,
            createdAtMs,
              event.weaponClass === "terminalPayload"
                ? isCritical
                  ? 1.85
                  : 1.5
                : isCritical
                  ? 1.55
                  : 1.28,
          );
          if (burst) {
            effects.push(burst);
          }
          if (impact) {
            effects.push(impact);
          }
        }
        continue;
      }

      if (isMiss) {
        const genericTracer = createCombatEffect(
          `${event.id}-tracer`,
          "tracer",
          event,
          createdAtMs,
          0.6,
        );
        if (genericTracer) {
          effects.push(genericTracer);
        }
        continue;
      }

      const genericImpact = createCombatEffect(
        `${event.id}-impact`,
        "impactRing",
        event,
        createdAtMs,
        isCritical ? 1.85 : 1.45,
      );
      if (genericImpact) {
        effects.push(genericImpact);
      }
      if (isCritical) {
        const burst = createCombatEffect(
          `${event.id}-burst`,
          "strikeBurst",
          event,
          createdAtMs,
          1.45,
        );
        if (burst) {
          effects.push(burst);
        }
      }
      continue;
    }

    if (event.kind === "destroyed") {
      const targetKey = getEventTargetKey(event);
      const followedEngagement = Boolean(targetKey && engagementTargets.has(targetKey));
      const impact = createCombatEffect(
        `${event.id}-impact`,
        "impactRing",
        event,
        createdAtMs,
        followedEngagement ? 1.9 : 1.45,
      );
      if (impact) {
        effects.push(impact);
      }

      const burst = createCombatEffect(
        `${event.id}-burst`,
        "strikeBurst",
        event,
        createdAtMs,
        followedEngagement ? 1.8 : 1.45,
      );
      if (burst) {
        effects.push(burst);
      }

      const killText = createFloatingTextEffect(
        `${event.id}-kill`,
        event,
        createdAtMs,
        "KILL",
        killTextColor,
        followedEngagement ? 1.25 : 1.1,
      );
      if (killText) {
        effects.push(killText);
      }
    }
  }

  return effects;
}

export function drawCombatEffects(
  ctx: CanvasRenderingContext2D,
  effects: CombatVisualEffect[],
  timestamp: number,
): void {
  for (const effect of effects) {
    const progress = clamp(
      (timestamp - effect.createdAtMs) / Math.max(1, effect.durationMs),
      0,
      1,
    );
    const alpha = (1 - progress) * clamp(0.92 * (effect.intensity ?? 1), 0.18, 1);
    const dx = effect.end.x - effect.start.x;
    const dy = effect.end.y - effect.start.y;
    const distance = Math.hypot(dx, dy);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexToRgba(effect.color, alpha);
    ctx.fillStyle = hexToRgba(effect.color, alpha * 0.9);
    ctx.shadowColor = hexToRgba(effect.color, alpha * 0.75);

    if (effect.kind === "floatingText") {
      const lift = 22 * progress * (effect.intensity ?? 1);
      const scale = clamp(1 + (1 - progress) * 0.14 * (effect.intensity ?? 1), 0.95, 1.2);
      const textX = effect.end.x;
      const textY = effect.end.y - 12 - lift;

      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.round(clamp(13 * scale, 13, 18))}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = clamp(4 * (effect.intensity ?? 1), 3, 5.5);
      ctx.strokeStyle = `rgba(12, 14, 18, ${alpha * 0.96})`;
      ctx.fillStyle = hexToRgba(effect.color, alpha);
      ctx.strokeText(effect.text ?? "", textX, textY);
      ctx.fillText(effect.text ?? "", textX, textY);
      ctx.restore();
      continue;
    }

    if (effect.kind === "tracer") {
      ctx.shadowBlur = clamp(6 * (effect.intensity ?? 1), 3, 8);
      ctx.lineWidth = clamp(1.2 * (effect.intensity ?? 1), 1, 2);
      ctx.beginPath();
      ctx.moveTo(effect.start.x, effect.start.y);
      ctx.lineTo(effect.end.x, effect.end.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        effect.start.x,
        effect.start.y,
        clamp(3 * (effect.intensity ?? 1), 2, 4),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        effect.end.x,
        effect.end.y,
        clamp(2.4 * (effect.intensity ?? 1), 1.5, 3.2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (effect.kind === "missileTrail") {
      const headX = effect.start.x + dx * clamp(progress + 0.16, 0.18, 1);
      const headY = effect.start.y + dy * clamp(progress + 0.16, 0.18, 1);
      ctx.shadowBlur = clamp(10 * (effect.intensity ?? 1), 5, 14);
      ctx.lineWidth = clamp(2.1 * (effect.intensity ?? 1), 1.6, 3.2);
      ctx.beginPath();
      ctx.moveTo(effect.start.x, effect.start.y);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        headX,
        headY,
        clamp(4.5 * (effect.intensity ?? 1), 3, 5.5),
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (effect.kind === "strikeBurst") {
      const descentLength = clamp(distance * 0.18, 16, 30);
      ctx.shadowBlur = clamp(12 * (effect.intensity ?? 1), 6, 16);
      ctx.lineWidth = clamp(2.4 * (effect.intensity ?? 1), 1.8, 3.4);
      ctx.beginPath();
      ctx.moveTo(effect.end.x - dx * 0.04, effect.end.y - descentLength);
      ctx.lineTo(effect.end.x, effect.end.y);
      ctx.stroke();

      const burstRadius = clamp(
        10 + progress * 22 * (effect.intensity ?? 1),
        8,
        28,
      );
      ctx.fillStyle = hexToRgba(effect.color, alpha * 0.25);
      ctx.beginPath();
      ctx.arc(effect.end.x, effect.end.y, burstRadius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(effect.color, alpha * 0.95);
      ctx.lineWidth = clamp(1.8 * (effect.intensity ?? 1), 1.3, 2.6);
      ctx.beginPath();
      ctx.arc(effect.end.x, effect.end.y, burstRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    const impactRadius = clamp(
      6 + progress * 22 * (effect.intensity ?? 1),
      5,
      36,
    );
    ctx.shadowBlur = clamp(12 * (effect.intensity ?? 1), 4, 16);
    ctx.lineWidth = clamp(1.6 * (effect.intensity ?? 1), 1.1, 2.6);
    ctx.strokeStyle = hexToRgba(effect.color, alpha * 0.95);
    ctx.beginPath();
    ctx.arc(effect.end.x, effect.end.y, impactRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = hexToRgba(effect.color, alpha * 0.14);
    ctx.beginPath();
    ctx.arc(effect.end.x, effect.end.y, impactRadius * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
