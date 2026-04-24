import type { AlliedCity, MobilePlatform } from "../../models/entity";
import { isPlatformDeployed } from "../../models/platform-utils";
import { getAssignmentTarget } from "../../simulation/update/targeting";
import {
  alliedDeploymentLineColor,
  assignmentColor,
  enemyDeploymentLineColor,
  interceptAssignmentColor,
} from "./constants";
import type { EntityRenderData } from "./types";

function drawThreatHeatmap(
  ctx: CanvasRenderingContext2D,
  cities: AlliedCity[],
): void {
  for (const city of cities) {
    const intensity = Math.max(0, Math.min(1, city.threat * 110));
    if (intensity <= 0) {
      continue;
    }

    const radius = 90 + intensity * 70;
    const gradient = ctx.createRadialGradient(
      city.position.x,
      city.position.y,
      8,
      city.position.x,
      city.position.y,
      radius,
    );

    gradient.addColorStop(0, `rgba(255, 0, 0, ${0.28 * intensity})`);
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(city.position.x, city.position.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAssignments(
  ctx: CanvasRenderingContext2D,
  data: EntityRenderData,
): void {
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);

  for (const assignment of data.assignments) {
    const platform = data.alliedPlatforms.find(
      (item) => item.id === assignment.resourceId,
    );
    if (!platform) {
      continue;
    }

    const target = getAssignmentTarget(
      platform,
      assignment,
      data.alliedCities,
      data.enemyPlatforms,
    );
    if (!target) {
      continue;
    }

    ctx.strokeStyle =
      assignment.mission === "intercept"
        ? interceptAssignmentColor
        : assignmentColor;
    ctx.beginPath();
    ctx.moveTo(platform.position.x, platform.position.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    if (assignment.mission === "intercept") {
      ctx.fillStyle = interceptAssignmentColor;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const midpointX = (platform.position.x + target.x) * 0.5;
    const midpointY = (platform.position.y + target.y) * 0.5;
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(224, 224, 224, 0.9)";
    ctx.fillText(
      `${
        assignment.mission === "intercept" ? "INT" : "RFT"
      }: ${assignment.resourceName} -> ${assignment.targetName}`,
      midpointX,
      midpointY - 6,
    );
  }

  ctx.setLineDash([]);
}

function drawDeployments(
  ctx: CanvasRenderingContext2D,
  platforms: MobilePlatform[],
  resolveOrigin: (platform: MobilePlatform) => { x: number; y: number } | undefined,
  color: string,
  lineDash: number[],
  shouldSkip?: (platform: MobilePlatform, origin: { x: number; y: number }) => boolean,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash(lineDash);

  for (const platform of platforms) {
    if (!isPlatformDeployed(platform)) {
      continue;
    }

    const origin = resolveOrigin(platform);
    if (!origin) {
      continue;
    }

    if (shouldSkip?.(platform, origin)) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(platform.position.x, platform.position.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

export function drawOperationalOverlays(
  ctx: CanvasRenderingContext2D,
  data: EntityRenderData,
): void {
  drawThreatHeatmap(ctx, data.alliedCities);
  drawDeployments(
    ctx,
    data.alliedPlatforms,
    (platform) =>
      data.alliedSpawnZones.find((item) => item.id === platform.originId)?.position,
    alliedDeploymentLineColor,
    [3, 7],
    (platform, origin) =>
      Math.hypot(
        platform.position.x - origin.x,
        platform.position.y - origin.y,
      ) <= 5,
  );
  drawAssignments(ctx, data);
  drawDeployments(
    ctx,
    data.enemyPlatforms,
    (platform) =>
      data.enemyBases.find((base) => base.id === platform.originId)?.position,
    enemyDeploymentLineColor,
    [4, 6],
  );
}
