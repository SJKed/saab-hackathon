import { loadMapData } from "./data/loader";
import { allocateResources } from "./engine/allocation";
import type { ResourceAssignment } from "./engine/allocation";
import { calculateThreatsForBases } from "./engine/threat";
import { createEnemyDeployments, updateEnemyPositions } from "./simulation/updater";
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
let bases = mapData.bases.map((base) => ({ ...base, position: { ...base.position } }));
let enemyBases = mapData.enemyBases.map((enemyBase) => ({
  ...enemyBase,
  position: { ...enemyBase.position },
}));
let resources = mapData.resources.map((resource) => ({
  ...resource,
  position: { ...resource.position },
}));
let enemies = createEnemyDeployments(enemyBases, bases);
let assignments: ResourceAssignment[] = [];
let hoverPoint: { x: number; y: number } | null = null;
let lastFrameTimestamp = performance.now();
let tickAccumulatorMs = 0;

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
  bases = mapData.bases.map((base) => ({ ...base, position: { ...base.position } }));
  enemyBases = mapData.enemyBases.map((enemyBase) => ({
    ...enemyBase,
    position: { ...enemyBase.position },
  }));
  resources = mapData.resources.map((resource) => ({
    ...resource,
    position: { ...resource.position },
  }));
  enemies = createEnemyDeployments(enemyBases, bases);
  assignments = [];
  tickAccumulatorMs = 0;
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
    const strategySpeedFactor = getStrategySpeedFactor(controlsState.strategy);
    enemies = updateEnemyPositions(
      enemies,
      bases,
      (simulationTickMs / 1000) * strategySpeedFactor,
    );
    bases = calculateThreatsForBases(bases, enemies);

    const resourcesForAllocation = resources.map((resource) => ({
      ...resource,
      available: resource.cooldown <= 0,
    }));

    const allocationResult = allocateResources(bases, resourcesForAllocation);
    resources = allocationResult.resources;
    assignments = allocationResult.assignments;
    tickAccumulatorMs -= simulationTickMs;
  }

  drawTerrain(ctx, mapData);
  drawGrid();
  renderEntities(ctx, {
    bases,
    enemyBases,
    enemies,
    resources,
    assignments,
    terrain: mapData.terrain,
    hoverPoint,
  });
  infoPanel.update(assignments);
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
