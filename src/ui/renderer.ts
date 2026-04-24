import { drawCombatEffects, mapCombatEventsToEffects } from "./rendering/effects";
import { drawOperationalOverlays } from "./rendering/overlays";
import { drawTerrain } from "./rendering/terrain";
import { drawTooltip } from "./rendering/tooltips";
import type { EntityRenderData } from "./rendering/types";
import { drawObjectivesAndPlatforms } from "./rendering/units";

export type { CombatVisualEffect, EntityRenderData } from "./rendering/types";
export { drawTerrain, drawTooltip, mapCombatEventsToEffects };

export function renderEntities(
  ctx: CanvasRenderingContext2D,
  data: EntityRenderData,
): void {
  drawOperationalOverlays(ctx, data);
  drawCombatEffects(ctx, data.combatEffects, performance.now());
  drawObjectivesAndPlatforms(ctx, data);
}
