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
import { getPlatformTransitSpeed, predictIntercept } from "../engine/intercept";
import type { ResourceAssignment } from "../engine/allocation";
import { getMetricsSnapshot } from "../engine/metrics";
import {
  distanceWorld,
  pixelRateToWorldRate,
} from "../models/distance";
import { getMissionFuelBudgetSeconds } from "../models/platform-recovery";
import {
  canDroneSacrificeTarget,
  getPlatformDisplayName,
  getPlatformTargetType,
  isReconPlatform,
  isPlatformDeployed,
  isPlatformStored,
} from "../models/platform-utils";
import type {
  AlliedSpawnZone,
  MobilePlatform,
  Vector,
} from "../models/entity";
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
const mapCommandClickThreshold = 6;
const commandTravelFuelBufferSeconds = 5;

type MapCommandMission = TrainingDeployRequest["mission"];

type SelectedSource =
  | { type: "platform"; platformId: string }
  | { type: "spawnZone"; spawnZoneId: string }
  | null;

type MapCommandPreview = {
  mission: MapCommandMission;
  start: Vector;
  end: Vector;
  valid: boolean;
  label: string;
};

function setStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
): void {
  Object.assign(element.style, styles);
}

function worldToScreenPoint(
  camera: { zoom: number; offsetX: number; offsetY: number },
  point: Vector,
): Vector {
  return {
    x: point.x * camera.zoom + camera.offsetX,
    y: point.y * camera.zoom + camera.offsetY,
  };
}

function clampPointToBounds(point: Vector, bounds: MapBounds): Vector {
  return {
    x: Math.max(bounds.minX + 8, Math.min(bounds.maxX - 8, point.x)),
    y: Math.max(bounds.minY + 8, Math.min(bounds.maxY - 8, point.y)),
  };
}

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
  let pointerDownPoint: { x: number; y: number } | null = null;
  let pointerMoved = false;
  let lastFrameTimestamp = performance.now();
  let tickAccumulatorMs = 0;
  let lastCommandMode = controls.getState().commandMode;
  let selectedSource: SelectedSource = null;
  let selectedResourceId: string | null = null;
  let pendingMission: MapCommandMission | null = null;

  const commandMenu = document.createElement("div");
  setStyles(commandMenu, {
    position: "absolute",
    zIndex: "18",
    minWidth: "220px",
    maxWidth: "260px",
    display: "none",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "8px",
    background: "rgba(8, 20, 24, 0.94)",
    color: "#f5f5f5",
    fontFamily: "Arial, sans-serif",
    boxShadow: "0 16px 30px rgba(0, 0, 0, 0.28)",
    pointerEvents: "auto",
  });
  const commandTitle = document.createElement("div");
  setStyles(commandTitle, {
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1.3",
  });
  const commandSubtitle = document.createElement("div");
  setStyles(commandSubtitle, {
    color: "#9fb6be",
    fontSize: "11px",
    lineHeight: "1.3",
  });
  const commandPlatformSelect = document.createElement("select");
  setStyles(commandPlatformSelect, {
    padding: "7px 8px",
    background: "#10242a",
    color: "#f5f5f5",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "6px",
    display: "none",
  });
  const missionButtonsRow = document.createElement("div");
  setStyles(missionButtonsRow, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  });
  const missionButtons: Record<MapCommandMission, HTMLButtonElement> = {
    intercept: document.createElement("button"),
    reinforce: document.createElement("button"),
    recon: document.createElement("button"),
  };
  const missionLabels: Record<MapCommandMission, string> = {
    intercept: "Intercept",
    reinforce: "Reinforce",
    recon: "Recon",
  };
  for (const mission of ["intercept", "reinforce", "recon"] as const) {
    const button = missionButtons[mission];
    button.type = "button";
    button.textContent = missionLabels[mission];
    setStyles(button, {
      padding: "6px 8px",
      background: "rgba(255, 255, 255, 0.06)",
      color: "#f5f5f5",
      border: "1px solid rgba(255, 255, 255, 0.16)",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "11px",
    });
    missionButtonsRow.appendChild(button);
  }
  const actionButtonsRow = document.createElement("div");
  setStyles(actionButtonsRow, {
    display: "flex",
    gap: "6px",
  });
  const recallButton = document.createElement("button");
  const cancelButton = document.createElement("button");
  const closeButton = document.createElement("button");
  for (const [button, label, background] of [
    [recallButton, "Recall", "#3a2f1f"],
    [cancelButton, "Cancel Targeting", "#21323a"],
    [closeButton, "Close", "#2a1f1f"],
  ] as const) {
    button.type = "button";
    button.textContent = label;
    setStyles(button, {
      padding: "6px 8px",
      background,
      color: "#f5f5f5",
      border: "1px solid rgba(255, 255, 255, 0.16)",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "11px",
      flex: "1",
    });
    actionButtonsRow.appendChild(button);
  }
  const commandHint = document.createElement("div");
  setStyles(commandHint, {
    color: "#b8c7cc",
    fontSize: "11px",
    lineHeight: "1.35",
  });
  commandMenu.append(
    commandTitle,
    commandSubtitle,
    commandPlatformSelect,
    missionButtonsRow,
    actionButtonsRow,
    commandHint,
  );
  shell.appElement.appendChild(commandMenu);

  function createOperatorAssignment(
    request: TrainingDeployRequest,
  ): ResourceAssignment | undefined {
    const platform = state.alliedPlatforms.find(
      (candidate) => candidate.id === request.resourceId,
    );
    if (!platform) {
      return undefined;
    }

    if (request.mission === "recon") {
      if (!request.targetPosition || !isReconPlatform(platform)) {
        return undefined;
      }

      const clampedPosition = clampPointToBounds(
        request.targetPosition,
        state.mapData.bounds,
      );
      const roundedPosition = {
        x: Math.round(clampedPosition.x),
        y: Math.round(clampedPosition.y),
      };

      return {
        mission: "recon",
        targetId: `recon-point:${roundedPosition.x}:${roundedPosition.y}`,
        targetName: `Recon point (${roundedPosition.x}, ${roundedPosition.y})`,
        targetPosition: roundedPosition,
        resourceId: platform.id,
        resourceName: getPlatformDisplayName(platform),
        distance: distanceWorld(platform.position, roundedPosition),
        threatScore: 0,
        priorityScore: 0,
        reason:
          "Operator-issued recon placement. The drone will move to the selected point and act as a mobile sensor picket.",
      };
    }

    if (request.mission === "intercept") {
      const target = state.enemyPlatforms.find(
        (candidate) => candidate.id === request.targetId,
      );
      if (!target) {
        return undefined;
      }
      if (
        isReconPlatform(platform) &&
        !canDroneSacrificeTarget(platform, getPlatformTargetType(target))
      ) {
        return undefined;
      }

      return {
        mission: "intercept",
        targetId: target.id,
        targetName: getPlatformDisplayName(target),
        resourceId: platform.id,
        resourceName: getPlatformDisplayName(platform),
        distance: distanceWorld(platform.position, target.position),
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
      distance: distanceWorld(platform.position, city.position),
      threatScore: city.threat,
      priorityScore: city.threat * 100,
      reason:
        "Operator-issued training command. The AI advisor remains available for comparison and critique.",
    };
  }

  function clearMapCommandSelection(): void {
    selectedSource = null;
    selectedResourceId = null;
    pendingMission = null;
  }

  function replaceOperatorAssignment(assignment: ResourceAssignment): void {
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

  function recallOperatorAssignment(resourceId: string): void {
    const operatorAssignments = state.operatorAssignments.filter(
      (assignment) => assignment.resourceId !== resourceId,
    );
    state = {
      ...state,
      operatorAssignments,
      assignments: operatorAssignments,
    };
  }

  function getAllowedMapMissions(): MapCommandMission[] {
    return controls.getState().commandMode === "auto"
      ? ["recon"]
      : ["intercept", "reinforce", "recon"];
  }

  function canIssueMissionWithPlatform(
    platform: MobilePlatform,
    mission: MapCommandMission,
  ): boolean {
    if (mission === "recon") {
      return isReconPlatform(platform);
    }

    if (mission === "intercept" && isReconPlatform(platform)) {
      return state.enemyPlatforms.some(
        (enemyPlatform) =>
          isPlatformDeployed(enemyPlatform) &&
          canDroneSacrificeTarget(platform, getPlatformTargetType(enemyPlatform)),
      );
    }

    return true;
  }

  function canManuallyCommandPlatform(platform: MobilePlatform): boolean {
    return getAllowedMapMissions().some((mission) =>
      canIssueMissionWithPlatform(platform, mission),
    );
  }

  function getStoredPlatformsForSpawnZone(
    spawnZoneId: string,
    mission?: MapCommandMission,
  ): MobilePlatform[] {
    return state.alliedPlatforms.filter(
      (platform) =>
        platform.originId === spawnZoneId &&
        isPlatformStored(platform) &&
        (!mission || canIssueMissionWithPlatform(platform, mission)),
    );
  }

  function getSelectedPlatform(): MobilePlatform | undefined {
    return selectedResourceId
      ? state.alliedPlatforms.find((platform) => platform.id === selectedResourceId)
      : undefined;
  }

  function getSelectedSourcePosition(): Vector | undefined {
    if (selectedSource?.type === "platform") {
      const selectedPlatformSource = selectedSource;
      return state.alliedPlatforms.find(
        (platform) => platform.id === selectedPlatformSource.platformId,
      )?.position;
    }

    if (selectedSource?.type === "spawnZone") {
      const selectedSpawnSource = selectedSource;
      return state.alliedSpawnZones.find(
        (spawnZone) => spawnZone.id === selectedSpawnSource.spawnZoneId,
      )?.position;
    }

    return undefined;
  }

  function getVisibleEnemyPlatforms(): MobilePlatform[] {
    const showHiddenEnemies = controls.getState().showHiddenEnemies;
    return state.enemyPlatforms.filter(
      (platform) =>
        isPlatformDeployed(platform) &&
        (showHiddenEnemies || state.detectionState.detectedEnemyIds.includes(platform.id)),
    );
  }

  function getPreviewForRequest(
    request: TrainingDeployRequest,
  ): { assignment?: ResourceAssignment; valid: boolean; label: string } {
    const platform = state.alliedPlatforms.find(
      (candidate) => candidate.id === request.resourceId,
    );
    if (!platform) {
      return {
        valid: false,
        label: "Selected platform is no longer available.",
      };
    }

    const assignment = createOperatorAssignment(request);
    if (!assignment) {
      return {
        valid: false,
        label: "This command is not valid for the selected platform.",
      };
    }

    if (request.mission === "intercept") {
      const target = state.enemyPlatforms.find(
        (candidate) => candidate.id === request.targetId,
      );
      if (!target) {
        return {
          valid: false,
          label: "Select a visible enemy target.",
        };
      }

      const intercept = predictIntercept(platform, target, state.alliedCities);
      if (!intercept?.feasibleBeforeImpact || !intercept.acquisitionFeasible) {
        return {
          assignment,
          valid: false,
          label: "No viable intercept window from current geometry.",
        };
      }

      const fuelBudget = getMissionFuelBudgetSeconds(
        platform,
        state.alliedSpawnZones,
        [],
      );
      if (fuelBudget <= intercept.timeToIntercept + commandTravelFuelBufferSeconds) {
        return {
          assignment,
          valid: false,
          label: `Low fuel: ETA ${intercept.timeToIntercept.toFixed(1)}s exceeds safe margin.`,
        };
      }

      return {
        assignment,
        valid: true,
        label: `INT ${assignment.targetName} | ETA ${intercept.timeToIntercept.toFixed(1)}s`,
      };
    }

    const targetPosition =
      request.mission === "reinforce"
        ? state.alliedCities.find((city) => city.id === request.targetId)?.position
        : request.targetPosition;
    if (!targetPosition) {
      return {
        assignment,
        valid: false,
        label: "Pick a target destination on the map.",
      };
    }

    const travelTime =
      distanceWorld(platform.position, targetPosition) /
      Math.max(
        0.001,
        pixelRateToWorldRate(getPlatformTransitSpeed(platform)),
      );
    const fuelBudget = getMissionFuelBudgetSeconds(
      platform,
      state.alliedSpawnZones,
      [],
    );
    if (fuelBudget <= travelTime + commandTravelFuelBufferSeconds) {
      return {
        assignment,
        valid: false,
        label: `Low fuel: ETA ${travelTime.toFixed(1)}s exceeds safe margin.`,
      };
    }

    return {
      assignment,
      valid: true,
      label: `${
        request.mission === "recon" ? "RCN" : "RFT"
      } ${assignment.targetName} | ETA ${travelTime.toFixed(1)}s`,
    };
  }

  function buildCommandUiState(): {
    selectedPlatformId?: string;
    selectedSpawnZoneId?: string;
    pendingMission?: MapCommandMission;
    validTargetIds?: string[];
    preview?: MapCommandPreview;
  } | undefined {
    if (!selectedSource) {
      return undefined;
    }

    const commandUi: {
      selectedPlatformId?: string;
      selectedSpawnZoneId?: string;
      pendingMission?: MapCommandMission;
      validTargetIds?: string[];
      preview?: MapCommandPreview;
    } = {
      selectedPlatformId:
        selectedSource.type === "platform" ? selectedSource.platformId : selectedResourceId ?? undefined,
      selectedSpawnZoneId:
        selectedSource.type === "spawnZone" ? selectedSource.spawnZoneId : undefined,
      pendingMission: pendingMission ?? undefined,
    };

    const platform = getSelectedPlatform();
    const sourcePosition = platform?.position ?? getSelectedSourcePosition();
    if (!pendingMission || !platform || !sourcePosition || !hoverWorldPoint) {
      return commandUi;
    }
    const hoveredPoint = hoverWorldPoint;

    if (pendingMission === "intercept") {
      const validTargets = getVisibleEnemyPlatforms().filter(
        (enemyPlatform) =>
          !isReconPlatform(platform) ||
          canDroneSacrificeTarget(platform, getPlatformTargetType(enemyPlatform)),
      );
      commandUi.validTargetIds = validTargets.map((target) => target.id);
      const hoveredTarget = validTargets.find(
        (enemyPlatform) =>
          Math.hypot(
            enemyPlatform.position.x - hoveredPoint.x,
            enemyPlatform.position.y - hoveredPoint.y,
          ) <= 18 / Math.max(0.5, camera.zoom),
      );
      if (hoveredTarget) {
        const preview = getPreviewForRequest({
          resourceId: platform.id,
          mission: "intercept",
          targetId: hoveredTarget.id,
        });
        commandUi.preview = {
          mission: "intercept",
          start: { ...sourcePosition },
          end: { ...hoveredTarget.position },
          valid: preview.valid,
          label: preview.label,
        };
      }
      return commandUi;
    }

    if (pendingMission === "reinforce") {
      commandUi.validTargetIds = state.alliedCities.map((city) => city.id);
      const hoveredCity = state.alliedCities.find(
        (city) =>
          Math.hypot(
            city.position.x - hoveredPoint.x,
            city.position.y - hoveredPoint.y,
          ) <= 20 / Math.max(0.5, camera.zoom),
      );
      if (hoveredCity) {
        const preview = getPreviewForRequest({
          resourceId: platform.id,
          mission: "reinforce",
          targetId: hoveredCity.id,
        });
        commandUi.preview = {
          mission: "reinforce",
          start: { ...sourcePosition },
          end: { ...hoveredCity.position },
          valid: preview.valid,
          label: preview.label,
        };
      }
      return commandUi;
    }

    const preview = getPreviewForRequest({
      resourceId: platform.id,
      mission: "recon",
      targetPosition: hoveredPoint,
    });
    commandUi.preview = {
      mission: "recon",
      start: { ...sourcePosition },
      end: { ...hoveredPoint },
      valid: preview.valid,
      label: preview.label,
    };
    return commandUi;
  }

  function applyOperatorRequests(): void {
    const deployRequest = trainingPanel.consumeDeployRequest();
    if (deployRequest) {
      const assignment = createOperatorAssignment(deployRequest);
      if (assignment) {
        replaceOperatorAssignment(assignment);
      }
    }

    const recallRequest = trainingPanel.consumeRecallRequest();
    if (recallRequest) {
      recallOperatorAssignment(recallRequest);
    }
  }

  function syncCommandMenu(renderPlatforms: MobilePlatform[]): void {
    if (!selectedSource) {
      commandMenu.style.display = "none";
      return;
    }

    const allowedMissions = getAllowedMapMissions();
    const selectedPlatform =
      selectedResourceId
        ? state.alliedPlatforms.find((platform) => platform.id === selectedResourceId)
        : undefined;
    if (selectedSource.type === "spawnZone") {
      const platforms = getStoredPlatformsForSpawnZone(
        selectedSource.spawnZoneId,
        pendingMission ?? undefined,
      ).filter((platform) => canManuallyCommandPlatform(platform));
      if (platforms.length === 0) {
        clearMapCommandSelection();
        commandMenu.style.display = "none";
        return;
      }

      commandPlatformSelect.style.display = "block";
      commandPlatformSelect.replaceChildren();
      for (const platform of platforms) {
        const option = document.createElement("option");
        option.value = platform.id;
        option.textContent = getPlatformDisplayName(platform);
        if (platform.id === selectedResourceId) {
          option.selected = true;
        }
        commandPlatformSelect.appendChild(option);
      }
      if (!selectedResourceId || !platforms.some((platform) => platform.id === selectedResourceId)) {
        selectedResourceId = platforms[0]?.id ?? null;
        if (selectedResourceId) {
          commandPlatformSelect.value = selectedResourceId;
        }
      }
    } else {
      commandPlatformSelect.style.display = "none";
      if (!selectedResourceId) {
        selectedResourceId = selectedSource.platformId;
      }
    }

    const activeAssignment = selectedResourceId
      ? state.operatorAssignments.find(
          (assignment) => assignment.resourceId === selectedResourceId,
        )
      : undefined;
    const selectedRenderPlatform = selectedResourceId
      ? renderPlatforms.find((platform) => platform.id === selectedResourceId)
      : undefined;
    const sourcePosition =
      selectedRenderPlatform?.position ?? getSelectedSourcePosition();
    if (!sourcePosition) {
      commandMenu.style.display = "none";
      return;
    }

    const anchorPoint = worldToScreenPoint(camera, sourcePosition);
    commandMenu.style.display = "flex";
    commandMenu.style.left = `${Math.min(
      shell.canvas.width - 280,
      Math.max(12, anchorPoint.x + 14),
    )}px`;
    commandMenu.style.top = `${Math.min(
      shell.canvas.height - 170,
      Math.max(12, anchorPoint.y - 18),
    )}px`;

    const selectedSpawnSource =
      selectedSource.type === "spawnZone" ? selectedSource : undefined;
    const selectedPlatformSource =
      selectedSource.type === "platform" ? selectedSource : undefined;
    commandTitle.textContent =
      selectedSpawnSource
        ? `${
            state.alliedSpawnZones.find(
              (spawnZone) => spawnZone.id === selectedSpawnSource.spawnZoneId,
            )?.name ?? selectedSpawnSource.spawnZoneId
          } launch control`
        : getPlatformDisplayName(
            selectedPlatform ?? { id: selectedPlatformSource?.platformId ?? "selected-platform" },
          );
    commandSubtitle.textContent = selectedPlatform
      ? `${selectedPlatform.platformClass} | ${selectedPlatform.role} | ${selectedPlatform.status}`
      : "Choose a stored platform, then select a mission.";

    for (const mission of ["intercept", "reinforce", "recon"] as const) {
      const button = missionButtons[mission];
      const enabled =
        allowedMissions.includes(mission) &&
        Boolean(selectedPlatform && canIssueMissionWithPlatform(selectedPlatform, mission));
      button.disabled = !enabled;
      button.style.opacity = enabled ? "1" : "0.45";
      button.style.cursor = enabled ? "pointer" : "not-allowed";
      button.style.background =
        pendingMission === mission
          ? mission === "intercept"
            ? "rgba(255, 183, 3, 0.22)"
            : mission === "recon"
              ? "rgba(76, 201, 240, 0.22)"
              : "rgba(116, 214, 128, 0.22)"
          : "rgba(255, 255, 255, 0.06)";
    }

    recallButton.disabled = !activeAssignment;
    recallButton.style.opacity = activeAssignment ? "1" : "0.45";
    cancelButton.disabled = !pendingMission;
    cancelButton.style.opacity = pendingMission ? "1" : "0.45";

    if (pendingMission && selectedPlatform) {
      const commandUiState = buildCommandUiState();
      commandHint.textContent = commandUiState?.preview?.label
        ? `${commandUiState.preview.label} Click on the map to confirm.`
        : pendingMission === "recon"
          ? "Click anywhere on the map to place the recon patrol."
          : pendingMission === "reinforce"
            ? "Click an allied city to reinforce it."
            : "Click a highlighted enemy target to intercept.";
    } else if (activeAssignment) {
      commandHint.textContent = `Manual task active: ${
        activeAssignment.mission === "intercept"
          ? "Intercept"
          : activeAssignment.mission === "recon"
            ? "Recon"
            : "Reinforce"
      } ${activeAssignment.targetName}.`;
    } else {
      commandHint.textContent = "Select a mission, then click the map to issue the command.";
    }
  }

  commandPlatformSelect.addEventListener("change", () => {
    selectedResourceId = commandPlatformSelect.value || null;
    pendingMission = null;
  });
  for (const mission of ["intercept", "reinforce", "recon"] as const) {
    missionButtons[mission].addEventListener("click", () => {
      const platform = getSelectedPlatform();
      if (!platform || !canIssueMissionWithPlatform(platform, mission)) {
        return;
      }
      pendingMission = mission;
    });
  }
  recallButton.addEventListener("click", () => {
    if (!selectedResourceId) {
      return;
    }
    recallOperatorAssignment(selectedResourceId);
    pendingMission = null;
  });
  cancelButton.addEventListener("click", () => {
    pendingMission = null;
  });
  closeButton.addEventListener("click", () => {
    clearMapCommandSelection();
  });

  function getSelectionRadiusWorld(rawRadius: number): number {
    return rawRadius / Math.max(0.5, camera.zoom);
  }

  function findAlliedPlatformAtPoint(point: Vector): MobilePlatform | undefined {
    return state.alliedPlatforms.find(
      (platform) =>
        canManuallyCommandPlatform(platform) &&
        isPlatformDeployed(platform) &&
        Math.hypot(
          platform.position.x - point.x,
          platform.position.y - point.y,
        ) <= getSelectionRadiusWorld(18),
    );
  }

  function findSpawnZoneAtPoint(point: Vector): AlliedSpawnZone | undefined {
    return state.alliedSpawnZones.find(
      (spawnZone) =>
        Math.hypot(
          spawnZone.position.x - point.x,
          spawnZone.position.y - point.y,
        ) <= getSelectionRadiusWorld(18),
    );
  }

  function findEnemyTargetAtPoint(point: Vector): MobilePlatform | undefined {
    return getVisibleEnemyPlatforms().find(
      (platform) =>
        Math.hypot(
          platform.position.x - point.x,
          platform.position.y - point.y,
        ) <= getSelectionRadiusWorld(18),
    );
  }

  function handleMapCommandClick(worldPoint: Vector): void {
    const selectedPlatform = getSelectedPlatform();
    if (pendingMission && selectedPlatform) {
      const request =
        pendingMission === "intercept"
          ? (() => {
              const enemyTarget = findEnemyTargetAtPoint(worldPoint);
              return enemyTarget
                ? {
                    resourceId: selectedPlatform.id,
                    mission: "intercept" as const,
                    targetId: enemyTarget.id,
                  }
                : undefined;
            })()
          : pendingMission === "reinforce"
            ? (() => {
                const city = state.alliedCities.find(
                  (candidate) =>
                    Math.hypot(
                      candidate.position.x - worldPoint.x,
                      candidate.position.y - worldPoint.y,
                    ) <= getSelectionRadiusWorld(20),
                );
                return city
                  ? {
                      resourceId: selectedPlatform.id,
                      mission: "reinforce" as const,
                      targetId: city.id,
                    }
                  : undefined;
              })()
            : {
                resourceId: selectedPlatform.id,
                mission: "recon" as const,
                targetPosition: worldPoint,
              };
      if (request) {
        const preview = getPreviewForRequest(request);
        if (preview.assignment && preview.valid) {
          replaceOperatorAssignment(preview.assignment);
          pendingMission = null;
          return;
        }
      }
    }

    const alliedPlatform = findAlliedPlatformAtPoint(worldPoint);
    if (alliedPlatform) {
      selectedSource = { type: "platform", platformId: alliedPlatform.id };
      selectedResourceId = alliedPlatform.id;
      pendingMission = null;
      return;
    }

    const spawnZone = findSpawnZoneAtPoint(worldPoint);
    if (spawnZone) {
      const storedPlatforms = getStoredPlatformsForSpawnZone(spawnZone.id).filter(
        (platform) => canManuallyCommandPlatform(platform),
      );
      if (storedPlatforms.length > 0) {
        selectedSource = { type: "spawnZone", spawnZoneId: spawnZone.id };
        selectedResourceId = storedPlatforms[0]?.id ?? null;
        pendingMission = null;
        return;
      }
    }

    clearMapCommandSelection();
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
    clearMapCommandSelection();
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
    const commandUiState = buildCommandUiState();

    const renderData = {
      alliedCities: renderState.alliedCities,
      alliedSpawnZones: renderState.alliedSpawnZones,
      enemyBases: renderState.enemyBases,
      enemyPlatforms: renderState.enemyPlatforms,
      alliedPlatforms: renderState.alliedPlatforms,
      detectionState: renderState.detectionState,
      showHiddenEnemies: controls.getState().showHiddenEnemies,
      assignments: renderState.assignments,
      combatEffects: renderState.combatEffects,
      terrain: state.mapData.terrain,
      hoverPointWorld: hoverWorldPoint,
      hoverPointScreen: hoverScreenPoint,
      viewZoom: camera.zoom,
      commandUi: commandUiState,
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
      alliedCities: state.alliedCities,
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
      operatorAssignments:
        controls.getState().commandMode === "training"
          ? state.operatorAssignments
          : state.operatorAssignments.filter(
              (assignment) => assignment.mission === "recon",
            ),
      advisorAssignments: state.advisorAssignments,
      feedbackMessages: state.trainingFeedback,
      hoverPointWorld: hoverWorldPoint,
    });
    syncCommandMenu(renderState.alliedPlatforms);
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
        trainingFeedback: [],
      };
      clearMapCommandSelection();
      lastCommandMode = controlsState.commandMode;
    }

    applyOperatorRequests();
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

    pointerDownPoint = getCanvasPoint(event);
    pointerMoved = false;
    isPanning = true;
    lastPanPoint = pointerDownPoint;
    shell.canvas.setPointerCapture(event.pointerId);
    updateHover(lastPanPoint);
  });

  shell.canvas.addEventListener("pointermove", (event) => {
    const point = getCanvasPoint(event);
    if (isPanning && lastPanPoint) {
      pointerMoved =
        pointerMoved ||
        Math.hypot(
          point.x - (pointerDownPoint?.x ?? lastPanPoint.x),
          point.y - (pointerDownPoint?.y ?? lastPanPoint.y),
        ) >
          mapCommandClickThreshold;
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

    const point = getCanvasPoint(event);
    isPanning = false;
    lastPanPoint = null;
    shell.canvas.releasePointerCapture(event.pointerId);
    if (
      pointerDownPoint &&
      Math.hypot(point.x - pointerDownPoint.x, point.y - pointerDownPoint.y) <=
        mapCommandClickThreshold &&
      !pointerMoved
    ) {
      handleMapCommandClick(screenToWorld(camera, point));
    }
    pointerDownPoint = null;
    pointerMoved = false;
  });

  shell.canvas.addEventListener("pointercancel", (event) => {
    if (!isPanning) {
      return;
    }

    isPanning = false;
    lastPanPoint = null;
    pointerDownPoint = null;
    pointerMoved = false;
    shell.canvas.releasePointerCapture(event.pointerId);
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  requestAnimationFrame(renderLoop);
}
