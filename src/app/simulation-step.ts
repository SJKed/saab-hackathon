import { allocateResources } from "../engine/allocation";
import { resolveCombat } from "../engine/combat";
import {
  calculateDetectionState,
  getDetectedEnemyPlatforms,
} from "../engine/detection";
import { coordinateEnemyDeployments } from "../engine/enemy-director";
import { updateMetricsState } from "../engine/metrics";
import { calculateThreatsForCities } from "../engine/threat";
import { buildTrainingFeedback } from "../engine/training-feedback";
import { isPlatformDestroyed } from "../models/platform-utils";
import {
  updateEnemyPositions,
  updateResourcePositions,
} from "../simulation/updater";
import { mapCombatEventsToEffects } from "../ui/renderer";
import type { DebugSettings } from "../models/debug";
import type { CommandMode } from "../models/training";
import type { SimulationState } from "./simulation-state";

const maxEventLogEntries = 60;

export function advanceSimulation(
  state: SimulationState,
  deltaSeconds: number,
  effectCreatedAtMs: number,
  debugSettings: DebugSettings,
  commandMode: CommandMode,
): SimulationState {
  const nextTick = state.simulationTick + 1;
  const enemyDeploymentState = coordinateEnemyDeployments(
    state.enemyDirectorState,
    nextTick,
    state.alliedCities,
    state.alliedPlatforms,
    state.enemyPlatforms,
    state.enemyBases,
    deltaSeconds,
    debugSettings,
  );
  let enemyPlatforms = updateEnemyPositions(
    enemyDeploymentState.enemyPlatforms,
    state.alliedPlatforms,
    state.alliedCities,
    state.enemyBases,
    deltaSeconds,
    state.mapData.bounds,
    debugSettings,
  );
  const allocationDetectionState = calculateDetectionState({
    alliedCities: state.alliedCities,
    alliedSpawnZones: state.alliedSpawnZones,
    alliedPlatforms: state.alliedPlatforms,
    enemyPlatforms,
    previousState: state.detectionState,
    tick: nextTick,
  });
  const detectedEnemyPlatforms = getDetectedEnemyPlatforms(
    enemyPlatforms,
    allocationDetectionState,
  );

  const allocationResult = allocateResources(
    state.alliedCities,
    state.alliedSpawnZones,
    state.alliedPlatforms,
    detectedEnemyPlatforms,
    state.alliedPostureMemory,
    deltaSeconds,
    debugSettings,
  );
  const operatorAssignments =
    commandMode === "training"
      ? state.operatorAssignments.filter((assignment) => {
          const resource = state.alliedPlatforms.find(
            (platform) => platform.id === assignment.resourceId,
          );
          if (!resource || isPlatformDestroyed(resource)) {
            return false;
          }

          return assignment.mission === "intercept"
            ? enemyPlatforms.some((enemy) => enemy.id === assignment.targetId)
            : state.alliedCities.some((city) => city.id === assignment.targetId);
        })
      : [];
  const activeAssignments =
    commandMode === "training"
      ? operatorAssignments
      : allocationResult.assignments;
  const metricsState = updateMetricsState(
    state.metricsState,
    enemyPlatforms,
    activeAssignments,
    nextTick,
  );
  let alliedPlatforms = updateResourcePositions(
    state.alliedPlatforms,
    activeAssignments,
    state.alliedCities,
    detectedEnemyPlatforms,
    state.alliedSpawnZones,
    deltaSeconds,
    state.mapData.bounds,
    debugSettings,
  );
  const detectionState = calculateDetectionState({
    alliedCities: state.alliedCities,
    alliedSpawnZones: state.alliedSpawnZones,
    alliedPlatforms,
    enemyPlatforms,
    previousState: allocationDetectionState,
    tick: nextTick,
  });

  const combatResolution = resolveCombat({
    alliedCities: state.alliedCities,
    alliedSpawnZones: state.alliedSpawnZones,
    enemyBases: state.enemyBases,
    alliedPlatforms,
    enemyPlatforms,
    detectedEnemyIds: detectionState.detectedEnemyIds,
    tick: nextTick,
    debugSettings,
  });

  alliedPlatforms = combatResolution.alliedPlatforms;
  enemyPlatforms = combatResolution.enemyPlatforms;

  const combatEffects =
    combatResolution.events.length > 0
      ? [
          ...state.combatEffects,
          ...mapCombatEventsToEffects(
            combatResolution.events,
            effectCreatedAtMs,
          ),
        ]
      : state.combatEffects;
  const eventLog =
    combatResolution.events.length > 0
      ? [...combatResolution.events, ...state.eventLog].slice(
          0,
          maxEventLogEntries,
        )
      : state.eventLog;

  return {
    ...state,
    alliedCities: calculateThreatsForCities(
      combatResolution.alliedCities,
      getDetectedEnemyPlatforms(enemyPlatforms, detectionState),
    ),
    alliedSpawnZones: combatResolution.alliedSpawnZones,
    enemyBases: combatResolution.enemyBases,
    alliedPlatforms,
    enemyPlatforms,
    detectionState,
    assignments: activeAssignments,
    operatorAssignments,
    advisorAssignments: allocationResult.assignments,
    trainingFeedback:
      commandMode === "training"
        ? buildTrainingFeedback(operatorAssignments, allocationResult.assignments)
        : [],
    alliedPostureMemory: allocationResult.postureMemory,
    alliedPostureSnapshot: allocationResult.postureSnapshot,
    responsePlannerSnapshot: allocationResult.plannerSnapshot,
    eventLog,
    combatEffects,
    enemyDirectorState: enemyDeploymentState.directorState,
    metricsState,
    simulationTick: nextTick,
  };
}
