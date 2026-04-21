import { loadMapData } from "./data/loader";
import { allocateResources } from "./engine/allocation";
import type { ResourceAssignment } from "./engine/allocation";
import { resolveCombat } from "./engine/combat";
import type { CombatLogEvent } from "./engine/combat";
import { calculateThreatsForCities } from "./engine/threat";
import {
  createEnemyDeployments,
  updateEnemyPositions,
  updateResourcePositions,
} from "./simulation/updater";
import type { StrategyMode } from "./ui/controls";
import { createControls } from "./ui/controls";
import { createInfoPanel } from "./ui/info-panel";
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
let assignments: ResourceAssignment[] = [];
let eventLog: CombatLogEvent[] = [];
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
  assignments = [];
  eventLog = [];
  tickAccumulatorMs = 0;
  simulationTick = 0;
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
      alliedCities,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );

    const resourcesForAllocation = resources.map((resource) => ({
      ...resource,
      available: resource.cooldown <= 0 && !resource.engagedWithId,
    }));

    const allocationResult = allocateResources(alliedCities, resourcesForAllocation, enemies);
    assignments = allocationResult.assignments;
    resources = updateResourcePositions(
      allocationResult.resources,
      assignments,
      alliedCities,
      enemies,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );

    const combatResolution = resolveCombat({
      alliedCities,
      alliedSpawnZones,
      enemyBases,
      enemies,
      resources,
      tick: simulationTick,
    });

    alliedCities = combatResolution.alliedCities;
    alliedSpawnZones = combatResolution.alliedSpawnZones;
    enemyBases = combatResolution.enemyBases;
    enemies = combatResolution.enemies;
    resources = combatResolution.resources;
    if (combatResolution.events.length > 0) {
      eventLog = [...combatResolution.events, ...eventLog].slice(0, 60);
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
    terrain: mapData.terrain,
    hoverPoint,
  });
  infoPanel.update(assignments, eventLog);
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
