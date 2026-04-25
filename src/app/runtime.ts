import {
  createFitCamera,
  panCamera,
  screenToWorld,
  zoomCameraAtPoint,
} from "./camera";
import type { AppShell } from "./dom";
import { advanceSimulation } from "./simulation-step";
import { createSimulationState, interpolateSimulationState } from "./simulation-state";
import type { MapBounds } from "../data/loader";
import type { ResourceAssignment } from "../engine/allocation";
import { getMetricsSnapshot } from "../engine/metrics";
import { distanceBetween, getPlatformDisplayName } from "../models/platform-utils";
import type { TrainingDeployRequest } from "../models/training";
import type { StrategyMode } from "../ui/controls";
import { createControls } from "../ui/controls";
import { createDebugMenu } from "../ui/debug-menu";
import { createInfoPanel } from "../ui/info-panel";
import { createModalRibbon } from "../ui/modal-ribbon";
import { createMetricsHud } from "../ui/metrics-hud";
import { createTrainingPanel } from "../ui/training-panel";
import { drawTerrain, drawTooltip, renderEntities } from "../ui/renderer";

const gridSize = 40;
const simulationTickMs = 125;
const maxSimulationStepsPerFrame = 4;

function getStrategySpeedFactor(strategy: StrategyMode): number {
  switch (strategy) {
    case "aggressive":
      return 1.15;
    case "defensive":
      return 0.85;
    case "balanced":
    default:
      return 1;
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  bounds: MapBounds,
): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;

  for (let x = bounds.minX; x <= bounds.maxX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, bounds.minY);
    ctx.lineTo(x, bounds.maxY);
    ctx.stroke();
  }

  for (let y = bounds.minY; y <= bounds.maxY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(bounds.minX, y);
    ctx.lineTo(bounds.maxX, y);
    ctx.stroke();
  }
}

export function startSimulation(shell: AppShell): void {
  const modalRibbon = createModalRibbon(shell.appElement);
  const controls = createControls(modalRibbon.workspace);
  const debugMenu = createDebugMenu(modalRibbon.workspace);
  const metricsHud = createMetricsHud(shell.appElement);
  const infoPanel = createInfoPanel(modalRibbon.workspace);
  const trainingPanel = createTrainingPanel(modalRibbon.workspace);

  modalRibbon.registerPanel({
    id: "controls",
    label: "Controls",
    panel: controls.root,
    defaultVisible: true,
  });
  modalRibbon.registerPanel({
    id: "debug",
    label: "Debug",
    panel: debugMenu.root,
    defaultVisible: false,
  });
  modalRibbon.registerPanel({
    id: "explain",
    label: "Explain",
    panel: infoPanel.root,
    defaultVisible: true,
  });
  modalRibbon.registerPanel({
    id: "training",
    label: "Training",
    panel: trainingPanel.root,
    defaultVisible: false,
  });

  let state = createSimulationState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  let previousState = state;
  let camera = createFitCamera(shell.canvas, state.mapData.bounds);
  let hoverScreenPoint: { x: number; y: number } | null = null;
  let hoverWorldPoint: { x: number; y: number } | null = null;
  let isPanning = false;
  let lastPanPoint: { x: number; y: number } | null = null;
  let lastFrameTimestamp = performance.now();
  let tickAccumulatorMs = 0;
  let lastCommandMode = controls.getState().commandMode;

  function createOperatorAssignment(
    request: TrainingDeployRequest,
  ): ResourceAssignment | undefined {
    const platform = state.alliedPlatforms.find(
      (candidate) => candidate.id === request.resourceId,
    );
    if (!platform) {
      return undefined;
    }

    if (request.mission === "intercept") {
      const target = state.enemyPlatforms.find(
        (candidate) => candidate.id === request.targetId,
      );
      if (!target) {
        return undefined;
      }

      return {
        mission: "intercept",
        targetId: target.id,
        targetName: getPlatformDisplayName(target),
        resourceId: platform.id,
        resourceName: getPlatformDisplayName(platform),
        distance: distanceBetween(platform.position, target.position),
        threatScore: target.threatLevel,
        priorityScore: target.threatLevel * 10,
        reason:
          "Operator-issued training command. The AI advisor remains available for comparison and critique.",
      };
    }

    const city = state.alliedCities.find((candidate) => candidate.id === request.targetId);
    if (!city) {
      return undefined;
    }

    return {
      mission: "reinforce",
      targetId: city.id,
      targetName: city.name ?? city.id,
      resourceId: platform.id,
      resourceName: getPlatformDisplayName(platform),
      distance: distanceBetween(platform.position, city.position),
      threatScore: city.threat,
      priorityScore: city.threat * 100,
      reason:
        "Operator-issued training command. The AI advisor remains available for comparison and critique.",
    };
  }

  function applyTrainingRequests(commandMode: typeof lastCommandMode): void {
    if (commandMode !== "training") {
      return;
    }

    const deployRequest = trainingPanel.consumeDeployRequest();
    if (deployRequest) {
      const assignment = createOperatorAssignment(deployRequest);
      if (assignment) {
        const operatorAssignments = [
          ...state.operatorAssignments.filter(
            (item) => item.resourceId !== assignment.resourceId,
          ),
          assignment,
        ];
        state = {
          ...state,
          operatorAssignments,
          assignments: operatorAssignments,
        };
      }
    }

    const recallRequest = trainingPanel.consumeRecallRequest();
    if (recallRequest) {
      const operatorAssignments = state.operatorAssignments.filter(
        (assignment) => assignment.resourceId !== recallRequest,
      );
      state = {
        ...state,
        operatorAssignments,
        assignments: operatorAssignments,
      };
    }
  }

  function getCanvasPoint(
    event: MouseEvent | PointerEvent | WheelEvent,
  ): { x: number; y: number } {
    const rect = shell.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function updateHover(point: { x: number; y: number } | null): void {
    hoverScreenPoint = point;
    hoverWorldPoint = point ? screenToWorld(camera, point) : null;
  }

  function resetSimulationState(width: number, height: number): void {
    shell.canvas.width = width;
    shell.canvas.height = height;
    state = createSimulationState({ width, height });
    previousState = state;
    tickAccumulatorMs = 0;
    camera = createFitCamera(shell.canvas, state.mapData.bounds);
    updateHover(null);
  }

  function resizeCanvas(): void {
    resetSimulationState(window.innerWidth, window.innerHeight);
  }

  function pruneCombatEffects(timestamp: number): void {
    state = {
      ...state,
      combatEffects: state.combatEffects.filter(
        (effect) => timestamp - effect.createdAtMs < effect.durationMs,
      ),
    };
  }

  function renderFrame(timestamp: number, interpolationAlpha: number): void {
    pruneCombatEffects(timestamp);
    const renderState = interpolateSimulationState(
      previousState,
      state,
      interpolationAlpha,
    );

    const renderData = {
      alliedCities: renderState.alliedCities,
      alliedSpawnZones: renderState.alliedSpawnZones,
      enemyBases: renderState.enemyBases,
      enemyPlatforms: renderState.enemyPlatforms,
      alliedPlatforms: renderState.alliedPlatforms,
      assignments: renderState.assignments,
      combatEffects: renderState.combatEffects,
      terrain: state.mapData.terrain,
      hoverPointWorld: hoverWorldPoint,
      hoverPointScreen: hoverScreenPoint,
      viewZoom: camera.zoom,
    };

    shell.ctx.setTransform(1, 0, 0, 1, 0, 0);
    shell.ctx.clearRect(0, 0, shell.canvas.width, shell.canvas.height);
    shell.ctx.fillStyle = "#0a2a43";
    shell.ctx.fillRect(0, 0, shell.canvas.width, shell.canvas.height);
    shell.ctx.save();
    shell.ctx.setTransform(
      camera.zoom,
      0,
      0,
      camera.zoom,
      camera.offsetX,
      camera.offsetY,
    );
    drawTerrain(shell.ctx, state.mapData);
    drawGrid(shell.ctx, state.mapData.bounds);
    renderEntities(shell.ctx, renderData);
    shell.ctx.restore();
    drawTooltip(shell.ctx, renderData);
    infoPanel.update(
      controls.getState().commandMode === "training"
        ? state.advisorAssignments
        : state.assignments,
      state.eventLog,
      state.alliedPostureSnapshot,
      state.responsePlannerSnapshot,
      state.enemyDirectorState.snapshot,
    );
    metricsHud.update(
      getMetricsSnapshot(
        state.metricsState,
        state.alliedCities,
        state.enemyPlatforms,
        state.alliedPlatforms,
        state.assignments,
      ),
    );
    debugMenu.update({
      alliedSpawnZones: state.alliedSpawnZones,
      enemyBases: state.enemyBases,
      alliedPlatforms: state.alliedPlatforms,
      enemyPlatforms: state.enemyPlatforms,
      assignments: state.assignments,
      directorSnapshot: state.enemyDirectorState.snapshot,
    });
    trainingPanel.update({
      commandMode: controls.getState().commandMode,
      alliedCities: state.alliedCities,
      alliedSpawnZones: state.alliedSpawnZones,
      alliedPlatforms: state.alliedPlatforms,
      enemyPlatforms: state.enemyPlatforms,
      operatorAssignments: state.operatorAssignments,
      advisorAssignments: state.advisorAssignments,
      feedbackMessages: state.trainingFeedback,
    });
  }

  function renderLoop(timestamp: number): void {
    const deltaMs = timestamp - lastFrameTimestamp;
    lastFrameTimestamp = timestamp;

    if (controls.consumeRestartRequest()) {
      resetSimulationState(shell.canvas.width, shell.canvas.height);
    }

    if (controls.consumeResetViewRequest()) {
      camera = createFitCamera(shell.canvas, state.mapData.bounds);
      updateHover(hoverScreenPoint);
    }

    const controlsState = controls.getState();
    if (controlsState.commandMode !== lastCommandMode) {
      tickAccumulatorMs = 0;
      state = {
        ...state,
        assignments:
          controlsState.commandMode === "training" ? state.operatorAssignments : [],
        trainingFeedback: [],
      };
      lastCommandMode = controlsState.commandMode;
    }

    applyTrainingRequests(controlsState.commandMode);
    if (controls.consumeStepRequest()) {
      tickAccumulatorMs = 0;
      previousState = state;
      state = advanceSimulation(
        state,
        (simulationTickMs / 1000) *
          getStrategySpeedFactor(controlsState.strategy),
        timestamp,
        debugMenu.getState(),
        controlsState.commandMode,
      );
    }

    if (controlsState.isRunning) {
      tickAccumulatorMs += Math.max(0, deltaMs) * controlsState.speedMultiplier;
    } else {
      tickAccumulatorMs = 0;
    }

    let stepsProcessed = 0;
    while (
      tickAccumulatorMs >= simulationTickMs &&
      stepsProcessed < maxSimulationStepsPerFrame
    ) {
      previousState = state;
      state = advanceSimulation(
        state,
        (simulationTickMs / 1000) *
          getStrategySpeedFactor(controlsState.strategy),
        timestamp,
        debugMenu.getState(),
        controlsState.commandMode,
      );
      tickAccumulatorMs -= simulationTickMs;
      stepsProcessed += 1;
    }

    if (stepsProcessed === maxSimulationStepsPerFrame) {
      tickAccumulatorMs = Math.min(tickAccumulatorMs, simulationTickMs - 1);
    }

    const interpolationAlpha =
      controlsState.isRunning && previousState.simulationTick !== state.simulationTick
        ? tickAccumulatorMs / simulationTickMs
        : 1;
    renderFrame(timestamp, interpolationAlpha);
    requestAnimationFrame(renderLoop);
  }

  shell.canvas.addEventListener("mousemove", (event) => {
    updateHover(getCanvasPoint(event));
  });

  shell.canvas.addEventListener("mouseleave", () => {
    if (!isPanning) {
      updateHover(null);
    }
  });

  shell.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = getCanvasPoint(event);
      camera = zoomCameraAtPoint(
        camera,
        shell.canvas,
        state.mapData.bounds,
        point,
        event.deltaY < 0 ? 1.12 : 1 / 1.12,
      );
      updateHover(point);
    },
    { passive: false },
  );

  shell.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    isPanning = true;
    lastPanPoint = getCanvasPoint(event);
    shell.canvas.setPointerCapture(event.pointerId);
    updateHover(lastPanPoint);
  });

  shell.canvas.addEventListener("pointermove", (event) => {
    const point = getCanvasPoint(event);
    if (isPanning && lastPanPoint) {
      camera = panCamera(
        camera,
        shell.canvas,
        state.mapData.bounds,
        point.x - lastPanPoint.x,
        point.y - lastPanPoint.y,
      );
      lastPanPoint = point;
    }
    updateHover(point);
  });

  shell.canvas.addEventListener("pointerup", (event) => {
    if (!isPanning) {
      return;
    }

    isPanning = false;
    lastPanPoint = null;
    shell.canvas.releasePointerCapture(event.pointerId);
  });

  shell.canvas.addEventListener("pointercancel", (event) => {
    if (!isPanning) {
      return;
    }

    isPanning = false;
    lastPanPoint = null;
    shell.canvas.releasePointerCapture(event.pointerId);
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  requestAnimationFrame(renderLoop);
}
