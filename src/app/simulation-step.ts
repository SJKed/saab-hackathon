import { allocateResources } from "../engine/allocation";
import { resolveCombat } from "../engine/combat";
import { coordinateEnemyDeployments } from "../engine/enemy-director";
import { updateMetricsState } from "../engine/metrics";
import { calculateThreatsForCities } from "../engine/threat";
import {
  updateEnemyPositions,
  updateResourcePositions,
} from "../simulation/updater";
import { mapCombatEventsToEffects } from "../ui/renderer";
import type { DebugSettings } from "../models/debug";
import type { SimulationState } from "./simulation-state";

const maxEventLogEntries = 60;

export function advanceSimulation(
  state: SimulationState,
  deltaSeconds: number,
  effectCreatedAtMs: number,
  debugSettings: DebugSettings,
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

  const allocationResult = allocateResources(
    state.alliedCities,
    state.alliedSpawnZones,
    state.alliedPlatforms,
    enemyPlatforms,
    state.alliedPostureMemory,
    deltaSeconds,
    debugSettings,
  );
  const metricsState = updateMetricsState(
    state.metricsState,
    enemyPlatforms,
    allocationResult.assignments,
    nextTick,
  );
  let alliedPlatforms = updateResourcePositions(
    state.alliedPlatforms,
    allocationResult.assignments,
    state.alliedCities,
    enemyPlatforms,
    state.alliedSpawnZones,
    deltaSeconds,
    state.mapData.bounds,
    debugSettings,
  );

  const combatResolution = resolveCombat({
    alliedCities: state.alliedCities,
    alliedSpawnZones: state.alliedSpawnZones,
    enemyBases: state.enemyBases,
    alliedPlatforms,
    enemyPlatforms,
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
      enemyPlatforms,
    ),
    alliedSpawnZones: combatResolution.alliedSpawnZones,
    enemyBases: combatResolution.enemyBases,
    alliedPlatforms,
    enemyPlatforms,
    assignments: allocationResult.assignments,
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
