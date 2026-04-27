import type { NormalizedMapData } from "../../data/loader";
import type { ResourceAssignment } from "../../engine/allocation";
import type { CombatLogEvent } from "../../engine/combat";
import type { DetectionState } from "../../engine/detection";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
  Vector,
} from "../../models/entity";

export type CombatVisualEffect = {
  id: string;
  kind:
    | "tracer"
    | "missileTrail"
    | "impactRing"
    | "strikeBurst"
    | "floatingText";
  sourceId?: string;
  targetId?: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: string;
  createdAtMs: number;
  durationMs: number;
  weaponClass?: CombatLogEvent["weaponClass"];
  intensity?: number;
  text?: string;
};

export type EntityRenderData = {
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  enemyPlatforms: MobilePlatform[];
  alliedPlatforms: MobilePlatform[];
  detectionState: DetectionState;
  showHiddenEnemies: boolean;
  assignments: ResourceAssignment[];
  combatEffects: CombatVisualEffect[];
  terrain: NormalizedMapData["terrain"];
  hoverPointWorld: { x: number; y: number } | null;
  hoverPointScreen: { x: number; y: number } | null;
  viewZoom: number;
  commandUi?: {
    selectedPlatformId?: string;
    selectedSpawnZoneId?: string;
    pendingMission?: "intercept" | "reinforce" | "recon";
    validTargetIds?: string[];
    preview?: {
      mission: "intercept" | "reinforce" | "recon";
      start: Vector;
      end: Vector;
      valid: boolean;
      label: string;
    };
  };
};
