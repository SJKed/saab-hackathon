import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
} from "../../models/entity";
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
): boolean {
  if (!image.complete || image.naturalWidth === 0) {
    return false;
  }

  const iconSize = platform.platformClass === "fighterJet" ? 30 : 24;
  ctx.save();
  ctx.translate(platform.position.x, platform.position.y);
  ctx.rotate(getPlatformHeading(platform));
  ctx.globalAlpha = platform.team === "allied" ? 0.95 : 0.92;
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

function drawPlatform(ctx: CanvasRenderingContext2D, platform: MobilePlatform): void {
  const x = platform.position.x;
  const y = platform.position.y;
  const accent = platform.team === "allied" ? alliedPlatformColor : enemyColor;
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

  const icon = getPlatformIcon(platform.platformClass);
  if (platform.platformClass === "ballisticMissile") {
    drawBallisticMissile(ctx, platform);
  } else if (!icon || !drawImagePlatformIcon(ctx, icon, platform)) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLabel(ctx, platform.name ?? platform.id, x, y - 14);
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
    if (isPlatformDeployed(platform)) {
      drawPlatform(ctx, platform);
    }
  }

  for (const platform of data.alliedPlatforms) {
    if (isPlatformDeployed(platform)) {
      drawPlatform(ctx, platform);
    }
  }
}
