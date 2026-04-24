import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  PlatformClass,
} from "../models/entity";
import type { NormalizedMapData } from "../data/loader";
import { getWeaponClassLabel } from "../data/platform-factories";
import type { ResourceAssignment } from "../engine/allocation";
import type { CombatLogEvent } from "../engine/combat";
import { predictIntercept } from "../engine/intercept";
import { isPlatformDeployed, isPlatformStored } from "../models/platform-utils";

export type CombatVisualEffect = {
  id: string;
  kind: "tracer" | "missileTrail" | "impactRing" | "strikeBurst";
  sourceId?: string;
  targetId?: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: string;
  createdAtMs: number;
  durationMs: number;
  weaponClass?: CombatLogEvent["weaponClass"];
  intensity?: number;
};

type EntityRenderData = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemyPlatforms: MobilePlatform[];
  alliedPlatforms: MobilePlatform[];
  assignments: ResourceAssignment[];
  combatEffects: CombatVisualEffect[];
  terrain: NormalizedMapData["terrain"];
  hoverPoint: { x: number; y: number } | null;
};

const cityColor = "#ffd166";
const alliedSpawnZoneColor = "#4cc9f0";
const enemyColor = "#ff6b6b";
const enemyBaseColor = "#d1495b";
const alliedPlatformColor = "#73d2ff";
const labelColor = "#e0e0e0";
const assignmentColor = "rgba(76, 201, 240, 0.7)";
const interceptAssignmentColor = "rgba(255, 183, 3, 0.78)";
const alliedDeploymentLineColor = "rgba(76, 201, 240, 0.36)";
const enemyDeploymentLineColor = "rgba(255, 107, 107, 0.45)";
const hoverPointRadius = 18;
const alliedEffectColor = "#73d2ff";
const enemyEffectColor = "#ff7a45";
const neutralEffectColor = "#ffd9a0";
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
    default:
      return 320;
  }
}

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

      if (event.weaponClass === "rapidFire") {
        const tracer = createCombatEffect(
          `${event.id}-tracer`,
          "tracer",
          event,
          createdAtMs,
          0.8,
        );
        const impact = createCombatEffect(
          `${event.id}-impact`,
          "impactRing",
          event,
          createdAtMs,
          0.7,
        );
        if (tracer) {
          effects.push(tracer);
        }
        if (impact) {
          effects.push(impact);
        }
        continue;
      }

      if (event.weaponClass === "airToAirMissile") {
        const trail = createCombatEffect(
          `${event.id}-trail`,
          "missileTrail",
          event,
          createdAtMs,
          1,
        );
        const impact = createCombatEffect(
          `${event.id}-impact`,
          "impactRing",
          event,
          createdAtMs,
          1,
        );
        if (trail) {
          effects.push(trail);
        }
        if (impact) {
          effects.push(impact);
        }
        continue;
      }

      if (event.weaponClass === "bomb") {
        const burst = createCombatEffect(
          `${event.id}-burst`,
          "strikeBurst",
          event,
          createdAtMs,
          1.15,
        );
        const impact = createCombatEffect(
          `${event.id}-impact`,
          "impactRing",
          event,
          createdAtMs,
          1.2,
        );
        if (burst) {
          effects.push(burst);
        }
        if (impact) {
          effects.push(impact);
        }
        continue;
      }

      const genericImpact = createCombatEffect(
        `${event.id}-impact`,
        "impactRing",
        event,
        createdAtMs,
        1.4,
      );
      if (genericImpact) {
        effects.push(genericImpact);
      }
      continue;
    }

    if (event.kind === "destroyed") {
      const targetKey = getEventTargetKey(event);
      if (targetKey && engagementTargets.has(targetKey)) {
        continue;
      }

      const impact = createCombatEffect(
        `${event.id}-impact`,
        "impactRing",
        event,
        createdAtMs,
        1,
      );
      if (impact) {
        effects.push(impact);
      }
    }
  }

  return effects;
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

function getPlatformHeading(platform: MobilePlatform): number {
  const speed = Math.hypot(platform.velocity.x, platform.velocity.y);
  if (speed <= 0.001) {
    return 0;
  }

  return Math.atan2(platform.velocity.x, -platform.velocity.y);
}

function getPlatformIcon(platformClass: PlatformClass): HTMLImageElement | undefined {
  if (platformClass === "fighterJet") {
    return airplaneIcon;
  }

  if (platformClass === "drone") {
    return droneIcon;
  }

  return undefined;
}

function getPlatformTint(team: MobilePlatform["team"], platformClass: PlatformClass): string {
  if (team === "allied") {
    return platformClass === "fighterJet"
      ? "invert(1) sepia(1) saturate(4) hue-rotate(150deg) brightness(1.1)"
      : "invert(1) sepia(1) saturate(3.4) hue-rotate(155deg) brightness(1.18)";
  }

  return platformClass === "fighterJet"
    ? "invert(1) sepia(1) saturate(5) hue-rotate(325deg) brightness(1.08)"
    : "invert(1) sepia(1) saturate(4) hue-rotate(350deg) brightness(1.22)";
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

function formatWeaponSummary(platform: MobilePlatform): string {
  if (platform.weapons.length === 0) {
    return "No reusable weapons";
  }

  return platform.weapons
    .map((weapon) => `${getWeaponClassLabel(weapon.weaponClass)} ${weapon.ammunition}/${weapon.maxAmmunition}`)
    .join(" | ");
}

function getPlatformInventorySummary(
  platforms: MobilePlatform[],
  originId: string,
  mode: "stored" | "deployed",
): string {
  const relevantPlatforms = platforms.filter(
    (platform) =>
      platform.originId === originId &&
      (mode === "stored" ? isPlatformStored(platform) : isPlatformDeployed(platform)),
  );
  const counts = {
    fighterJet: relevantPlatforms.filter((platform) => platform.platformClass === "fighterJet").length,
    drone: relevantPlatforms.filter((platform) => platform.platformClass === "drone").length,
    ballisticMissile: relevantPlatforms.filter((platform) => platform.platformClass === "ballisticMissile").length,
  };

  return `${counts.fighterJet} jets | ${counts.drone} drones | ${counts.ballisticMissile} missiles`;
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
          "Type: Allied City",
          `ID: ${city.id}`,
          `Threat: ${city.threat.toFixed(4)}`,
          `Integrity: ${city.health.toFixed(0)} / ${city.maxHealth.toFixed(0)}`,
          `Defense Rating: ${(city.defenseRating * 100).toFixed(0)}%`,
          `Position: (${Math.round(city.position.x)}, ${Math.round(city.position.y)})`,
        ],
      });
    }
  }

  for (const spawnZone of data.alliedSpawnZones) {
    const distance = Math.hypot(spawnZone.position.x - x, spawnZone.position.y - y);
    if (distance <= hoverPointRadius) {
      items.push({
        icon: "□",
        title: spawnZone.name ?? spawnZone.id,
        lines: [
          "Type: Allied Spawn Zone",
          `ID: ${spawnZone.id}`,
          `Available Tucked: ${getPlatformInventorySummary(data.alliedPlatforms, spawnZone.id, "stored")}`,
          `Deployed: ${getPlatformInventorySummary(data.alliedPlatforms, spawnZone.id, "deployed")}`,
          `Integrity: ${spawnZone.health.toFixed(0)} / ${spawnZone.maxHealth.toFixed(0)}`,
          `Defense Rating: ${(spawnZone.defenseRating * 100).toFixed(0)}%`,
          `Position: (${Math.round(spawnZone.position.x)}, ${Math.round(spawnZone.position.y)})`,
        ],
      });
    }
  }

  for (const platform of data.alliedPlatforms) {
    if (isPlatformStored(platform)) {
      continue;
    }

    const distance = Math.hypot(platform.position.x - x, platform.position.y - y);
    if (distance <= hoverPointRadius) {
      const assignment = data.assignments.find((item) => item.resourceId === platform.id);
      const missionStatus = assignment
        ? `${assignment.mission === "intercept" ? "Intercept" : "Reinforce"} ${assignment.targetName}`
        : platform.status;

      items.push({
        icon: platform.platformClass === "fighterJet" ? "▲" : platform.platformClass === "drone" ? "◍" : "◇",
        title: platform.name ?? platform.id,
        lines: [
          `Type: Allied ${platform.platformClass} (${platform.role})`,
          `Status: ${platform.status} | Task: ${missionStatus}`,
          `Origin: ${platform.originId ?? "Unknown"}`,
          `Speed: ${platform.cruiseSpeed.toFixed(0)} / ${platform.maxSpeed.toFixed(0)}`,
          `Durability/Evasion/Signature: ${platform.combat.durability.toFixed(0)} / ${platform.combat.evasion.toFixed(2)} / ${platform.combat.signature.toFixed(2)}`,
          `Sensors: ${platform.sensors.sensorType} ${platform.sensors.sensorRange.toFixed(0)}m`,
          `Endurance: ${platform.enduranceSeconds.toFixed(0)} / ${platform.maxEnduranceSeconds.toFixed(0)} s`,
          `Weapons: ${formatWeaponSummary(platform)}`,
        ],
      });
    }
  }

  for (const enemyBase of data.enemyBases) {
    const distance = Math.hypot(enemyBase.position.x - x, enemyBase.position.y - y);
    if (distance <= hoverPointRadius) {
      items.push({
        icon: "◆",
        title: enemyBase.name ?? enemyBase.id,
        lines: [
          "Type: Enemy Base",
          `ID: ${enemyBase.id}`,
          `Tucked Inventory: ${getPlatformInventorySummary(data.enemyPlatforms, enemyBase.id, "stored")}`,
          `Deployed: ${getPlatformInventorySummary(data.enemyPlatforms, enemyBase.id, "deployed")}`,
          `Integrity: ${enemyBase.health.toFixed(0)} / ${enemyBase.maxHealth.toFixed(0)}`,
          `Defense Rating: ${(enemyBase.defenseRating * 100).toFixed(0)}%`,
          `Position: (${Math.round(enemyBase.position.x)}, ${Math.round(enemyBase.position.y)})`,
        ],
      });
    }
  }

  for (const platform of data.enemyPlatforms) {
    if (isPlatformStored(platform)) {
      continue;
    }

    const distance = Math.hypot(platform.position.x - x, platform.position.y - y);
    if (distance <= hoverPointRadius) {
      items.push({
        icon: platform.platformClass === "fighterJet" ? "✈" : platform.platformClass === "drone" ? "◉" : "⬥",
        title: platform.name ?? platform.id,
        lines: [
          `Type: Enemy ${platform.platformClass} (${platform.role})`,
          `Status: ${platform.status}`,
          `Origin: ${platform.originId ?? "Unknown"}`,
          `Target: ${platform.targetId ?? "Unassigned"}`,
          `Threat Level: ${platform.threatLevel.toFixed(2)}`,
          `Speed: ${platform.cruiseSpeed.toFixed(0)} / ${platform.maxSpeed.toFixed(0)}`,
          `Durability/Evasion/Signature: ${platform.combat.durability.toFixed(0)} / ${platform.combat.evasion.toFixed(2)} / ${platform.combat.signature.toFixed(2)}`,
          `Weapons: ${formatWeaponSummary(platform)}`,
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
  const maxWidth = 420;
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
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0a2a43";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawWaterGrid(ctx);

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
  drawFogOverlay(ctx);
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
  const x = platform.position.x;
  const y = platform.position.y;
  const angle = getPlatformHeading(platform);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
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
  const isAllied = platform.team === "allied";
  const accent = isAllied ? alliedPlatformColor : enemyColor;
  const haloFill = isAllied
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
  platform: MobilePlatform,
  assignment: ResourceAssignment,
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): { x: number; y: number } | undefined {
  if (assignment.mission === "intercept") {
    const enemyPlatform = enemyPlatforms.find((item) => item.id === assignment.targetId);
    if (!enemyPlatform) {
      return undefined;
    }

    return predictIntercept(platform, enemyPlatform, cities)?.point ?? enemyPlatform.position;
  }

  return cities.find((city) => city.id === assignment.targetId)?.position;
}

function drawAssignments(
  ctx: CanvasRenderingContext2D,
  assignments: ResourceAssignment[],
  alliedPlatforms: MobilePlatform[],
  cities: AlliedCity[],
  enemyPlatforms: MobilePlatform[],
): void {
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);

  for (const assignment of assignments) {
    const platform = alliedPlatforms.find((item) => item.id === assignment.resourceId);
    if (!platform) {
      continue;
    }

    const target = getAssignmentTarget(platform, assignment, cities, enemyPlatforms);
    if (!target) {
      continue;
    }

    ctx.strokeStyle =
      assignment.mission === "intercept" ? interceptAssignmentColor : assignmentColor;
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
  alliedPlatforms: MobilePlatform[],
): void {
  ctx.strokeStyle = alliedDeploymentLineColor;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 7]);

  for (const platform of alliedPlatforms) {
    if (!isPlatformDeployed(platform)) {
      continue;
    }

    if (!platform.originId) {
      continue;
    }

    const spawnZone = spawnZones.find((item) => item.id === platform.originId);
    if (!spawnZone) {
      continue;
    }

    const distanceFromOrigin = Math.hypot(
      platform.position.x - spawnZone.position.x,
      platform.position.y - spawnZone.position.y,
    );
    if (distanceFromOrigin <= 5) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(spawnZone.position.x, spawnZone.position.y);
    ctx.lineTo(platform.position.x, platform.position.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function drawEnemyDeployments(
  ctx: CanvasRenderingContext2D,
  enemyBases: EnemyBase[],
  enemyPlatforms: MobilePlatform[],
): void {
  ctx.strokeStyle = enemyDeploymentLineColor;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 6]);

  for (const platform of enemyPlatforms) {
    if (!isPlatformDeployed(platform)) {
      continue;
    }

    if (!platform.originId) {
      continue;
    }

    const enemyBase = enemyBases.find((base) => base.id === platform.originId);
    if (!enemyBase) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(enemyBase.position.x, enemyBase.position.y);
    ctx.lineTo(platform.position.x, platform.position.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((char) => char + char)
          .join("")
      : sanitized;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawCombatEffects(
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

    if (effect.kind === "tracer") {
      ctx.shadowBlur = clamp(6 * (effect.intensity ?? 1), 3, 8);
      ctx.lineWidth = clamp(1.2 * (effect.intensity ?? 1), 1, 2);
      ctx.beginPath();
      ctx.moveTo(effect.start.x, effect.start.y);
      ctx.lineTo(effect.end.x, effect.end.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(effect.start.x, effect.start.y, clamp(3 * (effect.intensity ?? 1), 2, 4), 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(effect.end.x, effect.end.y, clamp(2.4 * (effect.intensity ?? 1), 1.5, 3.2), 0, Math.PI * 2);
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

      ctx.fillStyle = hexToRgba(effect.color, alpha);
      ctx.beginPath();
      ctx.arc(headX, headY, clamp(4.5 * (effect.intensity ?? 1), 3, 5.5), 0, Math.PI * 2);
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

      const burstRadius = clamp(10 + progress * 22 * (effect.intensity ?? 1), 8, 28);
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

    const impactRadius = clamp(6 + progress * 22 * (effect.intensity ?? 1), 5, 36);
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

export function renderEntities(ctx: CanvasRenderingContext2D, data: EntityRenderData): void {
  drawThreatHeatmap(ctx, data.alliedCities);
  drawAlliedDeployments(ctx, data.alliedSpawnZones, data.alliedPlatforms);
  drawAssignments(
    ctx,
    data.assignments,
    data.alliedPlatforms,
    data.alliedCities,
    data.enemyPlatforms,
  );
  drawEnemyDeployments(ctx, data.enemyBases, data.enemyPlatforms);
  drawCombatEffects(ctx, data.combatEffects, performance.now());

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

    drawPlatform(ctx, platform);
  }

  for (const platform of data.alliedPlatforms) {
    if (!isPlatformDeployed(platform)) {
      continue;
    }

    drawPlatform(ctx, platform);
  }

  drawTooltip(ctx, data);
}
