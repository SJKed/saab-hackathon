import type { NormalizedMapData } from "../../data/loader";

function getLandFillColors(
  subtype: string | undefined,
): { top: string; bottom: string } {
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

function drawWaterGrid(
  ctx: CanvasRenderingContext2D,
  map: Pick<NormalizedMapData, "bounds">,
): void {
  const spacing = 54;
  ctx.strokeStyle = "rgba(180, 215, 235, 0.06)";
  ctx.lineWidth = 1;

  for (let x = map.bounds.minX; x <= map.bounds.maxX; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, map.bounds.minY);
    ctx.lineTo(x, map.bounds.maxY);
    ctx.stroke();
  }

  for (let y = map.bounds.minY; y <= map.bounds.maxY; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(map.bounds.minX, y);
    ctx.lineTo(map.bounds.maxX, y);
    ctx.stroke();
  }
}

function drawFogOverlay(
  ctx: CanvasRenderingContext2D,
  map: Pick<NormalizedMapData, "bounds">,
): void {
  const centerX = (map.bounds.minX + map.bounds.maxX) * 0.5;
  const centerY = (map.bounds.minY + map.bounds.maxY) * 0.5;
  const outerRadius =
    Math.hypot(
      map.bounds.maxX - map.bounds.minX,
      map.bounds.maxY - map.bounds.minY,
    ) * 0.6;
  const fog = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    outerRadius,
  );
  fog.addColorStop(0, "rgba(200, 220, 230, 0.04)");
  fog.addColorStop(1, "rgba(0, 0, 0, 0.2)");

  ctx.fillStyle = fog;
  ctx.fillRect(
    map.bounds.minX,
    map.bounds.minY,
    map.bounds.maxX - map.bounds.minX,
    map.bounds.maxY - map.bounds.minY,
  );
}

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  map: Pick<NormalizedMapData, "terrain" | "bounds">,
): void {
  ctx.fillStyle = "#0a2a43";
  ctx.fillRect(
    map.bounds.minX,
    map.bounds.minY,
    map.bounds.maxX - map.bounds.minX,
    map.bounds.maxY - map.bounds.minY,
  );
  drawWaterGrid(ctx, map);

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

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  drawFogOverlay(ctx, map);
}
