import { loadMapData } from "./data/loader";
import { allocateResources } from "./engine/allocation";
import type { ResourceAssignment } from "./engine/allocation";
import { resolveCombat } from "./engine/combat";
import type { CombatLogEvent } from "./engine/combat";
import type { OrdnanceProjectile } from "./models/entity";
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
import { resolveOrdnance } from "./simulation/ordnance";
import type { StrategyMode } from "./ui/controls";
import { createControls } from "./ui/controls";
import { createInfoPanel } from "./ui/info-panel";
import { createMetricsHud } from "./ui/metrics-hud";
import { drawTerrain, renderEntities } from "./ui/renderer";

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
let resources = mapData.resources.map((resource) => ({
  ...resource,
  position: { ...resource.position },
  velocity: { ...resource.velocity },
}));
let enemies = createEnemyDeployments(enemyBases, alliedCities);
let projectiles: OrdnanceProjectile[] = [];
let assignments: ResourceAssignment[] = [];
let eventLog: CombatLogEvent[] = [];
let metricsState: MetricsState = createMetricsState(
  alliedCities,
  enemies,
  resources,
  0,
);
let lastEnemyBehaviorById: Record<string, string | undefined> = {};
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
  resources = mapData.resources.map((resource) => ({
    ...resource,
    position: { ...resource.position },
    velocity: { ...resource.velocity },
  }));
  enemies = createEnemyDeployments(enemyBases, alliedCities);
  projectiles = [];
  assignments = [];
  eventLog = [];
  tickAccumulatorMs = 0;
  simulationTick = 0;
  metricsState = createMetricsState(alliedCities, enemies, resources, simulationTick);
  lastEnemyBehaviorById = {};
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
    enemies = updateEnemyPositions(
      enemies,
      enemyBases,
      alliedCities,
      resources,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );
    const behaviorEvents: CombatLogEvent[] = [];
    for (const enemy of enemies) {
      const previous = lastEnemyBehaviorById[enemy.id];
      if (enemy.behaviorState && enemy.behaviorState !== previous) {
        behaviorEvents.push({
          id: `${simulationTick}-enemy-behavior-${enemy.id}-${enemy.behaviorState}`,
          tick: simulationTick,
          kind: "engagement",
          message: `${enemy.name ?? enemy.id} switched to ${enemy.behaviorState}.`,
        });
      }
      lastEnemyBehaviorById[enemy.id] = enemy.behaviorState;
    }

    const resourcesForAllocation = resources.map((resource) => ({
      ...resource,
      available: resource.cooldown <= 0 && !resource.engagedWithId,
    }));

    const allocationResult = allocateResources(
      alliedCities,
      alliedSpawnZones,
      resourcesForAllocation,
      enemies,
    );
    assignments = allocationResult.assignments;
    resources = updateResourcePositions(
      allocationResult.resources,
      assignments,
      alliedCities,
      alliedSpawnZones,
      enemies,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );

    const combatResolution = resolveCombat({
      alliedCities,
      alliedSpawnZones,
      enemyBases,
      enemies,
      resources,
      projectiles,
      tick: simulationTick,
    });
    const ordnanceResolution = resolveOrdnance({
      alliedCities: combatResolution.alliedCities,
      alliedSpawnZones: combatResolution.alliedSpawnZones,
      enemyBases: combatResolution.enemyBases,
      enemies: combatResolution.enemies,
      resources: combatResolution.resources,
      projectiles: combatResolution.projectiles,
      tick: simulationTick,
      deltaSeconds: (simulationTickMs / 1000) * strategySpeedFactor,
    });

    alliedCities = ordnanceResolution.alliedCities;
    alliedSpawnZones = ordnanceResolution.alliedSpawnZones;
    enemyBases = ordnanceResolution.enemyBases;
    enemies = ordnanceResolution.enemies;
    resources = ordnanceResolution.resources;
    projectiles = ordnanceResolution.projectiles;
    metricsState = updateMetricsState(
      metricsState,
      enemies,
      assignments,
      simulationTick,
      ordnanceResolution.stats,
    );
    const combinedEvents = [...behaviorEvents, ...combatResolution.events, ...ordnanceResolution.events];
    if (combinedEvents.length > 0) {
      eventLog = [...combinedEvents, ...eventLog].slice(0, 60);
    }

    alliedCities = calculateThreatsForCities(alliedCities, enemies);
    tickAccumulatorMs -= simulationTickMs;
  }

  drawTerrain(ctx, mapData);
  drawGrid();
  renderEntities(ctx, {
    alliedCities,
    alliedSpawnZones,
    enemyBases,
    enemies,
    resources,
    assignments,
    projectiles,
    terrain: mapData.terrain,
    hoverPoint,
  });
  infoPanel.update(assignments, eventLog);
  metricsHud.update(
    getMetricsSnapshot(metricsState, alliedCities, enemies, resources, assignments),
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
