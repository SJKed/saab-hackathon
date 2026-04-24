import { loadMapData, type NormalizedMapData } from "../data/loader";
import type { ResourceAssignment } from "../engine/allocation";
import type { CombatLogEvent } from "../engine/combat";
import {
  createEnemyDirectorState,
  type EnemyDirectorState,
} from "../engine/enemy-director";
import {
  applyPostureMemory,
  createTeamPostureMemory,
  evaluateAlliedForcePosture,
  type AlliedForcePostureSnapshot,
  type TeamPostureMemory,
} from "../engine/posture";
import {
  createMetricsState,
  type MetricsState,
} from "../engine/metrics";
import type {
  AlliedCity,
  AlliedSpawnZone,
  EnemyBase,
  MobilePlatform,
} from "../models/entity";
import { clonePlatform } from "../models/platform-utils";
import { createEnemyDeployments } from "../simulation/updater";
import type { CombatVisualEffect } from "../ui/renderer";

type CanvasSize = {
  width: number;
  height: number;
};

export type SimulationState = {
  mapData: NormalizedMapData;
  alliedCities: AlliedCity[];
  alliedSpawnZones: AlliedSpawnZone[];
  enemyBases: EnemyBase[];
  alliedPlatforms: MobilePlatform[];
  enemyPlatforms: MobilePlatform[];
  assignments: ResourceAssignment[];
  eventLog: CombatLogEvent[];
  combatEffects: CombatVisualEffect[];
  alliedPostureMemory: TeamPostureMemory;
  alliedPostureSnapshot: AlliedForcePostureSnapshot;
  enemyDirectorState: EnemyDirectorState;
  metricsState: MetricsState;
  simulationTick: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function cloneStaticObjective<T extends { position: { x: number; y: number } }>(
  objective: T,
): T {
  return {
    ...objective,
    position: { ...objective.position },
  };
}

function interpolatePlatform(
  previousPlatform: MobilePlatform | undefined,
  currentPlatform: MobilePlatform,
  alpha: number,
): MobilePlatform {
  if (
    !previousPlatform ||
    previousPlatform.status !== currentPlatform.status
  ) {
    return clonePlatform(currentPlatform);
  }

  return {
    ...clonePlatform(currentPlatform),
    position: {
      x: lerp(previousPlatform.position.x, currentPlatform.position.x, alpha),
      y: lerp(previousPlatform.position.y, currentPlatform.position.y, alpha),
    },
  };
}

export function interpolateSimulationState(
  previousState: SimulationState,
  currentState: SimulationState,
  alpha: number,
): SimulationState {
  if (previousState.simulationTick === currentState.simulationTick) {
    return currentState;
  }

  const interpolationAlpha = clamp(alpha, 0, 1);
  const previousAlliedPlatforms = new Map(
    previousState.alliedPlatforms.map((platform) => [platform.id, platform]),
  );
  const previousEnemyPlatforms = new Map(
    previousState.enemyPlatforms.map((platform) => [platform.id, platform]),
  );

  return {
    ...currentState,
    alliedPlatforms: currentState.alliedPlatforms.map((platform) =>
      interpolatePlatform(
        previousAlliedPlatforms.get(platform.id),
        platform,
        interpolationAlpha,
      ),
    ),
    enemyPlatforms: currentState.enemyPlatforms.map((platform) =>
      interpolatePlatform(
        previousEnemyPlatforms.get(platform.id),
        platform,
        interpolationAlpha,
      ),
    ),
  };
}

export function createSimulationState(canvasSize: CanvasSize): SimulationState {
  const mapData = loadMapData(canvasSize);
  const alliedCities = mapData.alliedCities.map(cloneStaticObjective);
  const alliedSpawnZones = mapData.alliedSpawnZones.map(cloneStaticObjective);
  const enemyBases = mapData.enemyBases.map(cloneStaticObjective);
  const alliedPlatforms = mapData.alliedPlatforms.map(clonePlatform);
  const enemyPlatforms = createEnemyDeployments(enemyBases, alliedCities);
  const alliedPostureMemory = createTeamPostureMemory();
  const alliedPosture = applyPostureMemory(
    evaluateAlliedForcePosture(alliedCities, alliedPlatforms, enemyPlatforms),
    alliedPostureMemory,
    0,
  );

  return {
    mapData,
    alliedCities,
    alliedSpawnZones,
    enemyBases,
    alliedPlatforms,
    enemyPlatforms,
    assignments: [],
    eventLog: [],
    combatEffects: [],
    alliedPostureMemory: alliedPosture.memory,
    alliedPostureSnapshot: alliedPosture.snapshot,
    enemyDirectorState: createEnemyDirectorState(enemyBases),
    metricsState: createMetricsState(
      alliedCities,
      enemyPlatforms,
      alliedPlatforms,
      0,
    ),
    simulationTick: 0,
  };
}
