import type { MobilePlatform, PlatformClass } from "../../models/entity";
import {
  airplaneIcon,
  droneIcon,
  labelColor,
} from "./constants";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hexToRgba(hex: string, alpha: number): string {
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

export function drawLabel(
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

export function isPointInsidePolygon(
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

export function getPlatformHeading(platform: MobilePlatform): number {
  const speed = Math.hypot(platform.velocity.x, platform.velocity.y);
  if (speed <= 0.001) {
    return 0;
  }

  return Math.atan2(platform.velocity.x, -platform.velocity.y);
}

export function getPlatformIcon(
  platformClass: PlatformClass,
): HTMLImageElement | undefined {
  if (platformClass === "fighterJet") {
    return airplaneIcon;
  }

  if (platformClass === "drone") {
    return droneIcon;
  }

  return undefined;
}

export function getPlatformTint(
  team: MobilePlatform["team"],
  platformClass: PlatformClass,
): string {
  if (team === "allied") {
    return platformClass === "fighterJet"
      ? "invert(1) sepia(1) saturate(4) hue-rotate(150deg) brightness(1.1)"
      : "invert(1) sepia(1) saturate(3.4) hue-rotate(155deg) brightness(1.18)";
  }

  return platformClass === "fighterJet"
    ? "invert(1) sepia(1) saturate(5) hue-rotate(325deg) brightness(1.08)"
    : "invert(1) sepia(1) saturate(4) hue-rotate(350deg) brightness(1.22)";
}
