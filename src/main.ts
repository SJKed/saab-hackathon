import { loadMapData } from "./data/loader";
import { allocateResources } from "./engine/allocation";
import type { ResourceAssignment } from "./engine/allocation";
import { resolveCombat } from "./engine/combat";
import type { CombatLogEvent } from "./engine/combat";
import {
  coordinateEnemyDeployments,
  createEnemyDirectorState,
} from "./engine/enemy-director";
import type { EnemyDirectorState } from "./engine/enemy-director";
import {
  createMetricsState,
  getMetricsSnapshot,
  updateMetricsState,
} from "./engine/metrics";
import type { MetricsState } from "./engine/metrics";
import { calculateThreatsForCities } from "./engine/threat";
import {
  createEnemyDeployments,
  updateEnemyPositions,
  updateResourcePositions,
} from "./simulation/updater";
import { clonePlatform } from "./models/platform-utils";
import type { StrategyMode } from "./ui/controls";
import { createControls } from "./ui/controls";
import { createInfoPanel } from "./ui/info-panel";
import { createMetricsHud } from "./ui/metrics-hud";
import {
  drawTerrain,
  mapCombatEventsToEffects,
  renderEntities,
} from "./ui/renderer";
import type { CombatVisualEffect } from "./ui/renderer";

const canvasElement = document.getElementById("simulation-canvas");
const appElement = document.getElementById("app");

if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element with id 'simulation-canvas' not found.");
}

if (!(appElement instanceof HTMLDivElement)) {
  throw new Error("App container with id 'app' not found.");
}

const canvas: HTMLCanvasElement = canvasElement;
const context = canvas.getContext("2d");

if (!context) {
  throw new Error("2D rendering context could not be created.");
}

const ctx: CanvasRenderingContext2D = context;
const controls = createControls(appElement);
const metricsHud = createMetricsHud(appElement);
const infoPanel = createInfoPanel(appElement);
const gridSize = 40;
const simulationTickMs = 250;

let mapData = loadMapData({
  width: window.innerWidth,
  height: window.innerHeight,
});
let alliedCities = mapData.alliedCities.map((city) => ({
  ...city,
  position: { ...city.position },
}));
let alliedSpawnZones = mapData.alliedSpawnZones.map((spawnZone) => ({
  ...spawnZone,
  position: { ...spawnZone.position },
}));
let enemyBases = mapData.enemyBases.map((enemyBase) => ({
  ...enemyBase,
  position: { ...enemyBase.position },
}));
let alliedPlatforms = mapData.alliedPlatforms.map(clonePlatform);
let enemyPlatforms = createEnemyDeployments(enemyBases, alliedCities);
let assignments: ResourceAssignment[] = [];
let eventLog: CombatLogEvent[] = [];
let combatEffects: CombatVisualEffect[] = [];
let enemyDirectorState: EnemyDirectorState = createEnemyDirectorState(enemyBases);
let metricsState: MetricsState = createMetricsState(
  alliedCities,
  enemyPlatforms,
  alliedPlatforms,
  0,
);
let hoverPoint: { x: number; y: number } | null = null;
let lastFrameTimestamp = performance.now();
let tickAccumulatorMs = 0;
let simulationTick = 0;

function getStrategySpeedFactor(strategy: StrategyMode): number {
  switch (strategy) {
    case "aggressive":
      return 1.15;
    case "defensive":
      return 0.85;
    case "balanced":
      return 1;
    default:
      return 1;
  }
}

function resetSimulationState(width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  mapData = loadMapData({ width, height });
  alliedCities = mapData.alliedCities.map((city) => ({
    ...city,
    position: { ...city.position },
  }));
  alliedSpawnZones = mapData.alliedSpawnZones.map((spawnZone) => ({
    ...spawnZone,
    position: { ...spawnZone.position },
  }));
  enemyBases = mapData.enemyBases.map((enemyBase) => ({
    ...enemyBase,
    position: { ...enemyBase.position },
  }));
  alliedPlatforms = mapData.alliedPlatforms.map(clonePlatform);
  enemyPlatforms = createEnemyDeployments(enemyBases, alliedCities);
  assignments = [];
  eventLog = [];
  combatEffects = [];
  enemyDirectorState = createEnemyDirectorState(enemyBases);
  tickAccumulatorMs = 0;
  simulationTick = 0;
  metricsState = createMetricsState(
    alliedCities,
    enemyPlatforms,
    alliedPlatforms,
    simulationTick,
  );
}

function resizeCanvas(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  resetSimulationState(width, height);
}

function drawGrid(): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function renderLoop(timestamp: number): void {
  const deltaMs = timestamp - lastFrameTimestamp;
  lastFrameTimestamp = timestamp;

  if (controls.consumeRestartRequest()) {
    resetSimulationState(canvas.width, canvas.height);
  }

  const controlsState = controls.getState();

  if (controlsState.isRunning) {
    tickAccumulatorMs += Math.max(0, deltaMs) * controlsState.speedMultiplier;
  } else {
    tickAccumulatorMs = 0;
  }

  while (tickAccumulatorMs >= simulationTickMs) {
    simulationTick += 1;
    const strategySpeedFactor = getStrategySpeedFactor(controlsState.strategy);
    const enemyDeploymentState = coordinateEnemyDeployments(
      enemyDirectorState,
      simulationTick,
      alliedCities,
      alliedPlatforms,
      enemyPlatforms,
      enemyBases,
    );
    enemyDirectorState = enemyDeploymentState.directorState;
    enemyPlatforms = enemyDeploymentState.enemyPlatforms;
    enemyPlatforms = updateEnemyPositions(
      enemyPlatforms,
      alliedCities,
      enemyBases,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );

    const allocationResult = allocateResources(
      alliedCities,
      alliedPlatforms,
      enemyPlatforms,
    );
    assignments = allocationResult.assignments;
    metricsState = updateMetricsState(
      metricsState,
      enemyPlatforms,
      assignments,
      simulationTick,
    );
    alliedPlatforms = updateResourcePositions(
      alliedPlatforms,
      assignments,
      alliedCities,
      enemyPlatforms,
      alliedSpawnZones,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );

    const combatResolution = resolveCombat({
      alliedCities,
      alliedSpawnZones,
      enemyBases,
      alliedPlatforms,
      enemyPlatforms,
      tick: simulationTick,
    });

    alliedCities = combatResolution.alliedCities;
    alliedSpawnZones = combatResolution.alliedSpawnZones;
    enemyBases = combatResolution.enemyBases;
    alliedPlatforms = combatResolution.alliedPlatforms;
    enemyPlatforms = combatResolution.enemyPlatforms;
    if (combatResolution.events.length > 0) {
      combatEffects = [
        ...combatEffects,
        ...mapCombatEventsToEffects(combatResolution.events, performance.now()),
      ];
      eventLog = [...combatResolution.events, ...eventLog].slice(0, 60);
    }

    alliedCities = calculateThreatsForCities(alliedCities, enemyPlatforms);
    tickAccumulatorMs -= simulationTickMs;
  }

  drawTerrain(ctx, mapData);
  drawGrid();
  combatEffects = combatEffects.filter(
    (effect) => timestamp - effect.createdAtMs < effect.durationMs,
  );
  renderEntities(ctx, {
    alliedCities,
    alliedSpawnZones,
    enemyBases,
    enemyPlatforms,
    alliedPlatforms,
    assignments,
    combatEffects,
    terrain: mapData.terrain,
    hoverPoint,
  });
  infoPanel.update(assignments, eventLog, enemyDirectorState.snapshot);
  metricsHud.update(
    getMetricsSnapshot(
      metricsState,
      alliedCities,
      enemyPlatforms,
      alliedPlatforms,
      assignments,
    ),
  );
  requestAnimationFrame(renderLoop);
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  hoverPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
});

canvas.addEventListener("mouseleave", () => {
  hoverPoint = null;
});

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(renderLoop);
