import type {
  AlliedCity,
  AlliedSpawnZone,
  Enemy,
  EnemyBase,
  Resource,
} from "../models/entity";
import type { NormalizedMapData } from "../data/loader";
import type { ResourceAssignment } from "../engine/allocation";
import { predictIntercept } from "../engine/intercept";

type EntityRenderData = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemies: Enemy[];
  resources: Resource[];
  assignments: ResourceAssignment[];
  terrain: NormalizedMapData["terrain"];
  hoverPoint: { x: number; y: number } | null;
};

const cityColor = "#ffd166";
const alliedSpawnZoneColor = "#4cc9f0";
const enemyColor = "#ff6b6b";
const enemyBaseColor = "#d1495b";
const resourceColor = "#4cc9f0";
const labelColor = "#e0e0e0";
const assignmentColor = "rgba(76, 201, 240, 0.7)";
const interceptAssignmentColor = "rgba(255, 183, 3, 0.78)";
const alliedDeploymentLineColor = "rgba(76, 201, 240, 0.36)";
const enemyDeploymentLineColor = "rgba(255, 107, 107, 0.45)";
const hoverPointRadius = 18;
const airplaneIcon = createIcon(new URL("../../assets/airplane.png", import.meta.url).href);
const droneIcon = createIcon(new URL("../../assets/drone.png", import.meta.url).href);

type TooltipItem = {
  icon: string;
  title: string;
  lines: string[];
};

function createIcon(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

function getLandFillColors(subtype: string | undefined): { top: string; bottom: string } {
  if (subtype === "mainland") {
    return { top: "#2a4a3a", bottom: "#1f3a2e" };
  }

  if (subtype === "island") {
    return { top: "#37604a", bottom: "#2a4d3a" };
  }

  if (subtype === "peninsula") {
    return { top: "#436d58", bottom: "#355f4a" };
  }

  return { top: "#2a4a3a", bottom: "#1f3a2e" };
}

function getShorelineColor(subtype: string | undefined): string {
  if (subtype === "mainland") {
    return "rgba(68, 112, 88, 0.85)";
  }

  if (subtype === "island") {
    return "rgba(85, 132, 104, 0.85)";
  }

  if (subtype === "peninsula") {
    return "rgba(97, 146, 120, 0.85)";
  }

  return "rgba(68, 112, 88, 0.85)";
}

function drawWaterGrid(ctx: CanvasRenderingContext2D): void {
  const spacing = 54;
  ctx.strokeStyle = "rgba(180, 215, 235, 0.06)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= ctx.canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ctx.canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= ctx.canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ctx.canvas.width, y);
    ctx.stroke();
  }
}

function drawFogOverlay(ctx: CanvasRenderingContext2D): void {
  const centerX = ctx.canvas.width * 0.5;
  const centerY = ctx.canvas.height * 0.5;
  const outerRadius = Math.hypot(ctx.canvas.width, ctx.canvas.height) * 0.6;
  const fog = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius);
  fog.addColorStop(0, "rgba(200, 220, 230, 0.04)");
  fog.addColorStop(1, "rgba(0, 0, 0, 0.2)");

  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function isPointInsidePolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.000001) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function collectTooltipItems(data: EntityRenderData): TooltipItem[] {
  if (!data.hoverPoint) {
    return [];
  }

  const items: TooltipItem[] = [];
  const { x, y } = data.hoverPoint;

  for (const city of data.alliedCities) {
    const distance = Math.hypot(city.position.x - x, city.position.y - y);
    if (distance <= hoverPointRadius) {
      items.push({
        icon: "▣",
        title: city.name ?? city.id,
        lines: [
          `Type: Allied City`,
          `ID: ${city.id}`,
          `Threat: ${city.threat.toFixed(4)}`,
          `Priority Value: ${city.value.toFixed(1)}`,
          `Position: (${Math.round(city.position.x)}, ${Math.round(city.position.y)})`,
        ],
      });
    }
  }

  for (const spawnZone of data.alliedSpawnZones) {
    const distance = Math.hypot(spawnZone.position.x - x, spawnZone.position.y - y);
    if (distance <= hoverPointRadius) {
      const deployedCount = data.resources.filter(
        (resource) => resource.originSpawnZoneId === spawnZone.id,
      ).length;

      items.push({
        icon: "□",
        title: spawnZone.name ?? spawnZone.id,
        lines: [
          `Type: Allied Spawn Zone`,
          `ID: ${spawnZone.id}`,
          `Deployed Resources: ${deployedCount}`,
          `Position: (${Math.round(spawnZone.position.x)}, ${Math.round(spawnZone.position.y)})`,
        ],
      });
    }
  }

  for (const resource of data.resources) {
    const distance = Math.hypot(resource.position.x - x, resource.position.y - y);
    if (distance <= hoverPointRadius) {
      const assignment = data.assignments.find(
        (item) => item.resourceId === resource.id,
      );
      const missionStatus = assignment
        ? `${assignment.mission === "intercept" ? "Intercepting" : "Reinforcing"} ${assignment.targetName}`
        : "Available";

      items.push({
        icon: "●",
        title: resource.name ?? resource.id,
        lines: [
          `Type: Resource (${resource.type})`,
          `ID: ${resource.id}`,
          `Origin: ${resource.originSpawnZoneId ?? "Unknown"}`,
          `Speed: ${resource.speed.toFixed(1)}`,
          `Range: ${resource.range.toFixed(1)}`,
          `Status: ${missionStatus}`,
          `Position: (${Math.round(resource.position.x)}, ${Math.round(resource.position.y)})`,
        ],
      });
    }
  }

  for (const enemyBase of data.enemyBases) {
    const distance = Math.hypot(enemyBase.position.x - x, enemyBase.position.y - y);
    if (distance <= hoverPointRadius) {
      const deployedCount = data.enemies.filter(
        (enemy) => enemy.originBaseId === enemyBase.id,
      ).length;

      items.push({
        icon: "◆",
        title: enemyBase.name ?? enemyBase.id,
        lines: [
          `Type: Enemy Base`,
          `ID: ${enemyBase.id}`,
          `Deployed Resources: ${deployedCount}`,
          `Position: (${Math.round(enemyBase.position.x)}, ${Math.round(enemyBase.position.y)})`,
        ],
      });
    }
  }

  for (const enemy of data.enemies) {
    const distance = Math.hypot(enemy.position.x - x, enemy.position.y - y);
    if (distance <= hoverPointRadius) {
      items.push({
        icon: enemy.platform === "airplane" ? "✈" : "◉",
        title: enemy.name ?? enemy.id,
        lines: [
          `Type: Enemy Resource (${enemy.platform})`,
          `ID: ${enemy.id}`,
          `Origin: ${enemy.originBaseId ?? "Unknown"}`,
          `Threat Level: ${enemy.threatLevel.toFixed(2)}`,
          `Target: ${enemy.targetId ?? "Unassigned"}`,
          `Position: (${Math.round(enemy.position.x)}, ${Math.round(enemy.position.y)})`,
        ],
      });
    }
  }

  for (const zone of data.terrain.landZones) {
    if (zone.points.length < 3) {
      continue;
    }

    if (isPointInsidePolygon(data.hoverPoint, zone.points)) {
      items.push({
        icon: "⬒",
        title: zone.name ?? zone.id ?? "Land Zone",
        lines: [
          `Type: Terrain (${zone.subtype ?? "unknown"})`,
          `Side: ${zone.side ?? "n/a"}`,
          `Vertices: ${zone.points.length}`,
        ],
      });
    }
  }

  return items;
}

function drawTooltip(ctx: CanvasRenderingContext2D, data: EntityRenderData): void {
  if (!data.hoverPoint) {
    return;
  }

  const tooltipItems = collectTooltipItems(data);
  if (tooltipItems.length === 0) {
    return;
  }

  const padding = 10;
  const lineHeight = 15;
  const blockGap = 8;
  const maxWidth = 360;
  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let contentHeight = 0;
  for (let i = 0; i < tooltipItems.length; i += 1) {
    const item = tooltipItems[i];
    contentHeight += lineHeight + item.lines.length * lineHeight;
    if (i < tooltipItems.length - 1) {
      contentHeight += blockGap;
    }
  }

  let boxX = data.hoverPoint.x + 16;
  let boxY = data.hoverPoint.y + 16;
  const boxWidth = maxWidth;
  const boxHeight = contentHeight + padding * 2;

  if (boxX + boxWidth > ctx.canvas.width - 8) {
    boxX = data.hoverPoint.x - boxWidth - 16;
  }
  if (boxX < 8) {
    boxX = 8;
  }

  if (boxY + boxHeight > ctx.canvas.height - 8) {
    boxY = ctx.canvas.height - boxHeight - 8;
  }
  if (boxY < 8) {
    boxY = 8;
  }

  ctx.fillStyle = "rgba(10, 20, 30, 0.92)";
  ctx.strokeStyle = "rgba(224, 224, 224, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
  ctx.fill();
  ctx.stroke();

  let cursorY = boxY + padding;
  for (let i = 0; i < tooltipItems.length; i += 1) {
    const item = tooltipItems[i];

    ctx.fillStyle = "#f5f5f5";
    ctx.font = "bold 12px Arial";
    ctx.fillText(`${item.icon} ${item.title}`, boxX + padding, cursorY);
    cursorY += lineHeight;

    ctx.fillStyle = "#d0dbe0";
    ctx.font = "12px Arial";
    for (const line of item.lines) {
      ctx.fillText(line, boxX + padding + 2, cursorY);
      cursorY += lineHeight;
    }

    if (i < tooltipItems.length - 1) {
      ctx.strokeStyle = "rgba(224, 224, 224, 0.15)";
      ctx.beginPath();
      ctx.moveTo(boxX + padding, cursorY + 2);
      ctx.lineTo(boxX + boxWidth - padding, cursorY + 2);
      ctx.stroke();
      cursorY += blockGap;
    }
  }
}

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  map: Pick<NormalizedMapData, "terrain">,
): void {
  // Water background layer.
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0a2a43";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawWaterGrid(ctx);

  // Subtle land shadow for depth.
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 10;

  for (const zone of map.terrain.landZones) {
    if (zone.points.length < 3) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(zone.points[0].x, zone.points[0].y);

    for (let i = 1; i < zone.points.length; i += 1) {
      ctx.lineTo(zone.points[i].x, zone.points[i].y);
    }

    ctx.closePath();
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of zone.points) {
      if (point.y < minY) {
        minY = point.y;
      }
      if (point.y > maxY) {
        maxY = point.y;
      }
    }

    const fillColors = getLandFillColors(zone.subtype);
    const gradient = ctx.createLinearGradient(0, minY, 0, maxY);
    gradient.addColorStop(0, fillColors.top);
    gradient.addColorStop(1, fillColors.bottom);

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = getShorelineColor(zone.subtype);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Reset shadow so overlays/entities remain crisp.
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  drawFogOverlay(ctx);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
): void {
  ctx.font = "12px Arial";
  ctx.fillStyle = labelColor;
  ctx.textAlign = "center";
  ctx.fillText(label, x, y);
}

function drawAlliedCity(ctx: CanvasRenderingContext2D, city: AlliedCity): void {
  const size = 18;
  const x = city.position.x;
  const y = city.position.y;

  ctx.fillStyle = "rgba(255, 209, 102, 0.22)";
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

function getEnemyHeading(enemy: Enemy): number {
  const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  if (speed <= 0.001) {
    return 0;
  }

  return Math.atan2(enemy.velocity.x, -enemy.velocity.y);
}

function drawImageEnemyIcon(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  enemy: Enemy,
): boolean {
  if (!image.complete || image.naturalWidth === 0) {
    return false;
  }

  const iconSize = enemy.platform === "airplane" ? 32 : 26;
  ctx.save();
  ctx.translate(enemy.position.x, enemy.position.y);
  ctx.rotate(getEnemyHeading(enemy));
  ctx.globalAlpha = enemy.platform === "airplane" ? 0.9 : 0.95;
  ctx.filter =
    enemy.platform === "airplane"
      ? "invert(1) brightness(1.35) contrast(1.15)"
      : "invert(1) brightness(1.55) contrast(1.25)";
  ctx.drawImage(image, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  ctx.restore();
  return true;
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  const icon = enemy.platform === "airplane" ? airplaneIcon : droneIcon;
  const x = enemy.position.x;
  const y = enemy.position.y;

  ctx.fillStyle = enemy.platform === "airplane"
    ? "rgba(255, 107, 107, 0.18)"
    : "rgba(255, 209, 102, 0.16)";
  ctx.strokeStyle = enemy.platform === "airplane"
    ? "rgba(255, 107, 107, 0.78)"
    : "rgba(255, 209, 102, 0.72)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, enemy.platform === "airplane" ? 17 : 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!drawImageEnemyIcon(ctx, icon, enemy)) {
    const width = 14;
    const height = 16;

    ctx.fillStyle = enemyColor;
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.lineTo(x + width / 2, y + height / 2);
    ctx.closePath();
    ctx.fill();
  }

  drawLabel(ctx, enemy.name ?? enemy.id, x, y - 14);
}

function drawResource(ctx: CanvasRenderingContext2D, resource: Resource): void {
  const radius = 7;
  const x = resource.position.x;
  const y = resource.position.y;
  const speed = Math.hypot(resource.velocity.x, resource.velocity.y);

  ctx.fillStyle = resourceColor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  if (speed > 0.1) {
    const directionX = resource.velocity.x / speed;
    const directionY = resource.velocity.y / speed;
    ctx.strokeStyle = "rgba(76, 201, 240, 0.86)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + directionX * 14, y + directionY * 14);
    ctx.stroke();
  }

  drawLabel(ctx, resource.name ?? resource.id, x, y - 12);
}

function drawThreatHeatmap(ctx: CanvasRenderingContext2D, cities: AlliedCity[]): void {
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

function getAssignmentTarget(
  resource: Resource,
  assignment: ResourceAssignment,
  cities: AlliedCity[],
  enemies: Enemy[],
): { x: number; y: number } | undefined {
  if (assignment.mission === "intercept") {
    const enemy = enemies.find((item) => item.id === assignment.targetId);
    if (!enemy) {
      return undefined;
    }

    return predictIntercept(resource, enemy, cities)?.point ?? enemy.position;
  }

  return cities.find((city) => city.id === assignment.targetId)?.position;
}

function drawAssignments(
  ctx: CanvasRenderingContext2D,
  assignments: ResourceAssignment[],
  resources: Resource[],
  cities: AlliedCity[],
  enemies: Enemy[],
): void {
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);

  for (const assignment of assignments) {
    const resource = resources.find((item) => item.id === assignment.resourceId);
    if (!resource) {
      continue;
    }

    const target = getAssignmentTarget(resource, assignment, cities, enemies);
    if (!target) {
      continue;
    }

    ctx.strokeStyle =
      assignment.mission === "intercept" ? interceptAssignmentColor : assignmentColor;
    ctx.beginPath();
    ctx.moveTo(resource.position.x, resource.position.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    if (assignment.mission === "intercept") {
      ctx.fillStyle = interceptAssignmentColor;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const midpointX = (resource.position.x + target.x) * 0.5;
    const midpointY = (resource.position.y + target.y) * 0.5;
    const allocationLabel = `${
      assignment.mission === "intercept" ? "INT" : "RFT"
    }: ${assignment.resourceName} -> ${assignment.targetName}`;
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(224, 224, 224, 0.9)";
    ctx.fillText(allocationLabel, midpointX, midpointY - 6);
  }

  ctx.setLineDash([]);
}

function drawAlliedDeployments(
  ctx: CanvasRenderingContext2D,
  spawnZones: AlliedSpawnZone[],
  resources: Resource[],
): void {
  ctx.strokeStyle = alliedDeploymentLineColor;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 7]);

  for (const resource of resources) {
    if (!resource.originSpawnZoneId) {
      continue;
    }

    const spawnZone = spawnZones.find(
      (item) => item.id === resource.originSpawnZoneId,
    );
    if (!spawnZone) {
      continue;
    }

    const distanceFromOrigin = Math.hypot(
      resource.position.x - spawnZone.position.x,
      resource.position.y - spawnZone.position.y,
    );
    if (distanceFromOrigin <= 5) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(spawnZone.position.x, spawnZone.position.y);
    ctx.lineTo(resource.position.x, resource.position.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function drawEnemyDeployments(
  ctx: CanvasRenderingContext2D,
  enemyBases: EnemyBase[],
  enemies: Enemy[],
): void {
  ctx.strokeStyle = enemyDeploymentLineColor;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 6]);

  for (const enemy of enemies) {
    if (!enemy.originBaseId) {
      continue;
    }

    const enemyBase = enemyBases.find((base) => base.id === enemy.originBaseId);
    if (!enemyBase) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(enemyBase.position.x, enemyBase.position.y);
    ctx.lineTo(enemy.position.x, enemy.position.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

export function renderEntities(ctx: CanvasRenderingContext2D, data: EntityRenderData): void {
  drawThreatHeatmap(ctx, data.alliedCities);
  drawAlliedDeployments(ctx, data.alliedSpawnZones, data.resources);
  drawAssignments(
    ctx,
    data.assignments,
    data.resources,
    data.alliedCities,
    data.enemies,
  );
  drawEnemyDeployments(ctx, data.enemyBases, data.enemies);

  // Positions are already mapped into canvas space by the data loader.
  for (const city of data.alliedCities) {
    drawAlliedCity(ctx, city);
  }

  for (const spawnZone of data.alliedSpawnZones) {
    drawAlliedSpawnZone(ctx, spawnZone);
  }

  for (const enemyBase of data.enemyBases) {
    drawEnemyBase(ctx, enemyBase);
  }

  for (const enemy of data.enemies) {
    drawEnemy(ctx, enemy);
  }

  for (const resource of data.resources) {
    drawResource(ctx, resource);
  }

  drawTooltip(ctx, data);
}
