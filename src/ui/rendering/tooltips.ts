import { getWeaponClassLabel } from "../../data/platform-factories";
import { isPlatformDeployed, isPlatformStored } from "../../models/platform-utils";
import { hoverPointRadius } from "./constants";
import { isPointInsidePolygon } from "./shared";
import type { EntityRenderData } from "./types";

type TooltipItem = {
  icon: string;
  title: string;
  lines: string[];
};

function formatWeaponSummary(
  platform: EntityRenderData["alliedPlatforms"][number],
): string {
  if (platform.weapons.length === 0) {
    return "No reusable weapons";
  }

  return platform.weapons
    .map(
      (weapon) =>
        `${getWeaponClassLabel(weapon.weaponClass)} ${weapon.ammunition}/${weapon.maxAmmunition}`,
    )
    .join(" | ");
}

function getPlatformInventorySummary(
  platforms: EntityRenderData["alliedPlatforms"],
  originId: string,
  mode: "stored" | "deployed",
): string {
  const relevantPlatforms = platforms.filter(
    (platform) =>
      platform.originId === originId &&
      (mode === "stored" ? isPlatformStored(platform) : isPlatformDeployed(platform)),
  );
  const counts = {
    fighterJet: relevantPlatforms.filter(
      (platform) => platform.platformClass === "fighterJet",
    ).length,
    drone: relevantPlatforms.filter((platform) => platform.platformClass === "drone").length,
    ballisticMissile: relevantPlatforms.filter(
      (platform) => platform.platformClass === "ballisticMissile",
    ).length,
  };

  return `${counts.fighterJet} jets | ${counts.drone} drones | ${counts.ballisticMissile} missiles`;
}

function collectTooltipItems(data: EntityRenderData): TooltipItem[] {
  if (!data.hoverPointWorld) {
    return [];
  }

  const items: TooltipItem[] = [];
  const { x, y } = data.hoverPointWorld;
  const hoverRadius = hoverPointRadius / Math.max(0.5, data.viewZoom);

  for (const city of data.alliedCities) {
    if (Math.hypot(city.position.x - x, city.position.y - y) <= hoverRadius) {
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
    if (
      Math.hypot(spawnZone.position.x - x, spawnZone.position.y - y) <=
      hoverRadius
    ) {
      items.push({
        icon: "□",
        title: spawnZone.name ?? spawnZone.id,
        lines: [
          "Type: Allied Spawn Zone",
          `ID: ${spawnZone.id}`,
          `Available Tucked: ${getPlatformInventorySummary(
            data.alliedPlatforms,
            spawnZone.id,
            "stored",
          )}`,
          `Deployed: ${getPlatformInventorySummary(
            data.alliedPlatforms,
            spawnZone.id,
            "deployed",
          )}`,
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

    if (
      Math.hypot(platform.position.x - x, platform.position.y - y) <=
      hoverRadius
    ) {
      const assignment = data.assignments.find(
        (item) => item.resourceId === platform.id,
      );
      items.push({
        icon:
          platform.platformClass === "fighterJet"
            ? "▲"
            : platform.platformClass === "drone"
              ? "◍"
              : "◇",
        title: platform.name ?? platform.id,
        lines: [
          `Type: Allied ${platform.platformClass} (${platform.role})`,
          `Status: ${platform.status} | Task: ${
            assignment
              ? `${assignment.mission === "intercept" ? "Intercept" : "Reinforce"} ${assignment.targetName}`
              : platform.status
          }`,
          `Combat Phase: ${platform.combatPhase ?? "none"}`,
          `Origin: ${platform.originId ?? "Unknown"}`,
          `Speed: ${platform.cruiseSpeed.toFixed(0)} / ${platform.maxSpeed.toFixed(0)}`,
          `Durability/Evasion/Signature: ${platform.combat.durability.toFixed(0)} / ${platform.combat.evasion.toFixed(2)} / ${platform.combat.signature.toFixed(2)}`,
          `Sensors: ${platform.sensors.sensorType} ${platform.sensors.sensorRange.toFixed(0)}m`,
          `Fuel: ${platform.enduranceSeconds.toFixed(0)} / ${platform.maxEnduranceSeconds.toFixed(0)} s`,
          `Weapons: ${formatWeaponSummary(platform)}`,
          platform.disengageReason
            ? `Breakaway: ${platform.disengageReason}`
            : "Breakaway: none",
        ],
      });
    }
  }

  for (const enemyBase of data.enemyBases) {
    if (
      Math.hypot(enemyBase.position.x - x, enemyBase.position.y - y) <=
      hoverRadius
    ) {
      items.push({
        icon: "◆",
        title: enemyBase.name ?? enemyBase.id,
        lines: [
          "Type: Enemy Base",
          `ID: ${enemyBase.id}`,
          `Tucked Inventory: ${getPlatformInventorySummary(
            data.enemyPlatforms,
            enemyBase.id,
            "stored",
          )}`,
          `Deployed: ${getPlatformInventorySummary(
            data.enemyPlatforms,
            enemyBase.id,
            "deployed",
          )}`,
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

    if (
      Math.hypot(platform.position.x - x, platform.position.y - y) <=
      hoverRadius
    ) {
      items.push({
        icon:
          platform.platformClass === "fighterJet"
            ? "✈"
            : platform.platformClass === "drone"
              ? "◉"
              : "⬥",
        title: platform.name ?? platform.id,
        lines: [
          `Type: Enemy ${platform.platformClass} (${platform.role})`,
          `Status: ${platform.status}`,
          `Combat Phase: ${platform.combatPhase ?? "none"}`,
          `Origin: ${platform.originId ?? "Unknown"}`,
          `Target: ${platform.targetId ?? "Unassigned"}`,
          `Threat Level: ${platform.threatLevel.toFixed(2)}`,
          `Speed: ${platform.cruiseSpeed.toFixed(0)} / ${platform.maxSpeed.toFixed(0)}`,
          `Durability/Evasion/Signature: ${platform.combat.durability.toFixed(0)} / ${platform.combat.evasion.toFixed(2)} / ${platform.combat.signature.toFixed(2)}`,
          `Weapons: ${formatWeaponSummary(platform)}`,
          platform.disengageReason
            ? `Breakaway: ${platform.disengageReason}`
            : "Breakaway: none",
        ],
      });
    }
  }

  for (const zone of data.terrain.landZones) {
    if (
      zone.points.length >= 3 &&
      isPointInsidePolygon(data.hoverPointWorld, zone.points)
    ) {
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

export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  data: EntityRenderData,
): void {
  if (!data.hoverPointScreen) {
    return;
  }

  const tooltipItems = collectTooltipItems(data);
  if (tooltipItems.length === 0) {
    return;
  }

  const padding = 10;
  const lineHeight = 15;
  const blockGap = 8;
  const boxWidth = 420;
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

  let boxX = data.hoverPointScreen.x + 16;
  let boxY = data.hoverPointScreen.y + 16;
  const boxHeight = contentHeight + padding * 2;

  if (boxX + boxWidth > ctx.canvas.width - 8) {
    boxX = data.hoverPointScreen.x - boxWidth - 16;
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
