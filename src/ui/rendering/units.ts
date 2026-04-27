import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
} from "../../models/entity";
import type { LastKnownEnemyContact } from "../../engine/detection";
import { isPlatformDeployed } from "../../models/platform-utils";
import {
  alliedPlatformColor,
  alliedSpawnZoneColor,
  cityColor,
  enemyBaseColor,
  enemyColor,
} from "./constants";
import {
  drawLabel,
  getPlatformHeading,
  getPlatformIcon,
  getPlatformTint,
} from "./shared";
import type { EntityRenderData } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDurabilityBarColor(durabilityRatio: number): string {
  if (durabilityRatio <= 0.35) {
    return "#ff5d5d";
  }

  if (durabilityRatio <= 0.6) {
    return "#ffb703";
  }

  return "#7ae582";
}

function drawPlatformDurabilityBar(
  ctx: CanvasRenderingContext2D,
  platform: MobilePlatform,
  radius: number,
): void {
  const maxDurability = Math.max(1, platform.combat.maxDurability);
  const durabilityRatio = clamp(platform.combat.durability / maxDurability, 0, 1);
  const shouldShow =
    Boolean(platform.engagedWithId || platform.combatPhase) || durabilityRatio < 0.999;
  if (!shouldShow) {
    return;
  }

  const width = platform.platformClass === "fighterJet" ? 26 : 20;
  const height = 4;
  const x = platform.position.x - width / 2;
  const y = platform.position.y + radius + 6;

  ctx.fillStyle = "rgba(8, 10, 14, 0.78)";
  ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = getDurabilityBarColor(durabilityRatio);
  ctx.fillRect(x, y, width * durabilityRatio, height);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);
}

function drawAlliedCity(ctx: CanvasRenderingContext2D, city: AlliedCity): void {
  const size = 18;
  const x = city.position.x;
  const y = city.position.y;
  const integrity = city.health / Math.max(1, city.maxHealth);

  ctx.fillStyle = `rgba(255, 209, 102, ${0.16 + integrity * 0.14})`;
  ctx.strokeStyle = cityColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = cityColor;
  ctx.fillRect(x - size / 2, y - size / 4, size / 3, size / 2);
  ctx.fillRect(x - size / 12, y - size / 2, size / 3, size * 0.75);
  ctx.fillRect(x + size / 3, y - size / 6, size / 3, size * 0.42);

  drawLabel(ctx, city.name ?? city.id, x, y - 20);
}

function drawAlliedSpawnZone(
  ctx: CanvasRenderingContext2D,
  spawnZone: AlliedSpawnZone,
): void {
  const size = 18;
  const x = spawnZone.position.x;
  const y = spawnZone.position.y;

  ctx.strokeStyle = alliedSpawnZoneColor;
  ctx.fillStyle = "rgba(76, 201, 240, 0.14)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x - size / 2, y - size / 2, size, size);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.stroke();

  drawLabel(ctx, spawnZone.name ?? spawnZone.id, x, y - 15);
}

function drawEnemyBase(ctx: CanvasRenderingContext2D, enemyBase: EnemyBase): void {
  const size = 18;
  const x = enemyBase.position.x;
  const y = enemyBase.position.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = enemyBaseColor;
  ctx.strokeStyle = "rgba(255, 180, 190, 0.92)";
  ctx.lineWidth = 1.5;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 107, 107, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.stroke();

  drawLabel(ctx, enemyBase.name ?? enemyBase.id, x, y - 18);
}

function drawImagePlatformIcon(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  platform: MobilePlatform,
  alpha: number,
): boolean {
  if (!image.complete || image.naturalWidth === 0) {
    return false;
  }

  const iconSize = platform.platformClass === "fighterJet" ? 30 : 24;
  ctx.save();
  ctx.translate(platform.position.x, platform.position.y);
  ctx.rotate(getPlatformHeading(platform));
  ctx.globalAlpha = alpha;
  ctx.filter = getPlatformTint(platform.team, platform.platformClass);
  ctx.drawImage(image, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  ctx.restore();
  return true;
}

function drawBallisticMissile(
  ctx: CanvasRenderingContext2D,
  platform: MobilePlatform,
): void {
  ctx.save();
  ctx.translate(platform.position.x, platform.position.y);
  ctx.rotate(getPlatformHeading(platform));
  ctx.fillStyle = platform.team === "allied" ? alliedPlatformColor : enemyColor;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(5, 6);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle =
    platform.team === "allied"
      ? "rgba(115, 210, 255, 0.75)"
      : "rgba(255, 107, 107, 0.78)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(0, 13);
  ctx.stroke();
  ctx.restore();
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  platform: MobilePlatform,
  options?: { alpha?: number; debugHidden?: boolean },
): void {
  const x = platform.position.x;
  const y = platform.position.y;
  const accent = platform.team === "allied" ? alliedPlatformColor : enemyColor;
  const alpha = options?.alpha ?? 1;
  const haloFill =
    platform.team === "allied"
      ? "rgba(115, 210, 255, 0.16)"
      : platform.platformClass === "fighterJet"
        ? "rgba(255, 107, 107, 0.18)"
        : "rgba(255, 209, 102, 0.16)";
  const radius =
    platform.platformClass === "fighterJet"
      ? 16
      : platform.platformClass === "drone"
        ? 14
        : 11;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = haloFill;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (platform.combatPhase) {
    ctx.strokeStyle =
      platform.combatPhase === "attackRun"
        ? "rgba(255, 183, 3, 0.9)"
        : platform.combatPhase === "disengaging"
          ? "rgba(255, 107, 107, 0.92)"
          : "rgba(224, 224, 224, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (options?.debugHidden) {
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(224, 224, 224, 0.52)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const icon = getPlatformIcon(platform.platformClass);
  if (platform.platformClass === "ballisticMissile") {
    drawBallisticMissile(ctx, platform);
  } else if (!icon || !drawImagePlatformIcon(ctx, icon, platform, alpha)) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlatformDurabilityBar(ctx, platform, radius);
  drawLabel(ctx, platform.name ?? platform.id, x, y - 14);
  ctx.restore();
}

function drawGhostContact(
  ctx: CanvasRenderingContext2D,
  contact: LastKnownEnemyContact,
): void {
  const x = contact.position.x;
  const y = contact.position.y;
  const ageAlpha = Math.max(0.18, Math.min(0.48, 0.5 - contact.staleTicks * 0.015));
  const radius =
    contact.platformClass === "fighterJet"
      ? 15
      : contact.platformClass === "drone"
        ? 13
        : 10;

  ctx.save();
  ctx.globalAlpha = ageAlpha;
  ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
  ctx.fillStyle = "rgba(255, 209, 102, 0.08)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255, 209, 102, 0.7)";
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.7, y - radius * 0.7);
  ctx.lineTo(x + radius * 0.7, y + radius * 0.7);
  ctx.moveTo(x + radius * 0.7, y - radius * 0.7);
  ctx.lineTo(x - radius * 0.7, y + radius * 0.7);
  ctx.stroke();
  drawLabel(ctx, `${contact.enemyName} last seen`, x, y - 14);
  ctx.restore();
}

export function drawObjectivesAndPlatforms(
  ctx: CanvasRenderingContext2D,
  data: EntityRenderData,
): void {
  for (const city of data.alliedCities) {
    drawAlliedCity(ctx, city);
  }

  for (const spawnZone of data.alliedSpawnZones) {
    drawAlliedSpawnZone(ctx, spawnZone);
  }

  for (const enemyBase of data.enemyBases) {
    drawEnemyBase(ctx, enemyBase);
  }

  for (const platform of data.enemyPlatforms) {
    if (!isPlatformDeployed(platform)) {
      continue;
    }

    const isDetected = data.detectionState.detectedEnemyIds.includes(platform.id);
    if (isDetected) {
      drawPlatform(ctx, platform);
    } else if (data.showHiddenEnemies) {
      drawPlatform(ctx, platform, {
        alpha: 0.34,
        debugHidden: true,
      });
    }
  }

  if (!data.showHiddenEnemies) {
    const detectedEnemyIds = new Set(data.detectionState.detectedEnemyIds);
    for (const contact of data.detectionState.lastKnownEnemyContacts) {
      if (!detectedEnemyIds.has(contact.enemyId) && contact.staleTicks > 0) {
        drawGhostContact(ctx, contact);
      }
    }
  }

  for (const platform of data.alliedPlatforms) {
    if (isPlatformDeployed(platform)) {
      drawPlatform(ctx, platform);
    }
  }
}
