import type { CommandMode } from "../models/training";

export type StrategyMode = "aggressive" | "defensive" | "balanced";

export type ControlsState = {
  isRunning: boolean;
  commandMode: CommandMode;
  strategy: StrategyMode;
  speedMultiplier: number;
  showHiddenEnemies: boolean;
};

type ControlsApi = {
  root: HTMLElement;
  getState: () => ControlsState;
  consumeRestartRequest: () => boolean;
  consumeResetViewRequest: () => boolean;
  consumeStepRequest: () => boolean;
};

function createControlRow(label: string): HTMLDivElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexDirection = "column";
  row.style.gap = "6px";

  const labelElement = document.createElement("label");
  labelElement.textContent = label;
  labelElement.style.fontSize = "12px";
  labelElement.style.color = "#e0e0e0";
  row.appendChild(labelElement);

  return row;
}

export function createControls(container: HTMLElement): ControlsApi {
  const state: ControlsState = {
    isRunning: false,
    commandMode: "auto",
    strategy: "balanced",
    speedMultiplier: 1,
    showHiddenEnemies: false,
  };
  let restartRequested = false;
  let resetViewRequested = false;
  let stepRequested = false;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
 
  const panel = document.createElement("aside");
  panel.style.position = "absolute";
  panel.style.top = "48px";
  panel.style.right = "16px";
  panel.style.width = "220px";
  panel.style.height = "min(340px, 48vh)";
  panel.style.minWidth = "220px";
  panel.style.minHeight = "220px";
  panel.style.maxWidth = "calc(100vw - 32px)";
  panel.style.maxHeight = "calc(100vh - 32px)";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.overflow = "hidden";
  panel.style.resize = "both";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  panel.style.borderRadius = "8px";
  panel.style.background = "rgba(8, 20, 24, 0.9)";
  panel.style.backdropFilter = "blur(2px)";
  panel.style.fontFamily = "Arial, sans-serif";
  panel.style.boxShadow = "0 18px 42px rgba(0, 0, 0, 0.24)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "10px";
  header.style.padding = "10px 12px";
  header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";
  header.style.cursor = "move";
  header.style.userSelect = "none";
  panel.appendChild(header);

  const title = document.createElement("strong");
  title.textContent = "Simulation Controls";
  title.style.color = "#f5f5f5";
  title.style.fontSize = "14px";
  header.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Time and simulation transport";
  subtitle.style.color = "#8fa8b1";
  subtitle.style.fontSize = "11px";
  subtitle.style.whiteSpace = "nowrap";
  header.appendChild(subtitle);

  const body = document.createElement("div");
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "12px";
  body.style.padding = "12px";
  body.style.overflowY = "auto";
  body.style.minHeight = "0";
  body.style.flex = "1";
  panel.appendChild(body);

  const startPauseButton = document.createElement("button");
  startPauseButton.textContent = "Start";
  startPauseButton.style.padding = "8px 10px";
  startPauseButton.style.background = "#1f3a2e";
  startPauseButton.style.color = "#f5f5f5";
  startPauseButton.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  startPauseButton.style.borderRadius = "6px";
  startPauseButton.style.cursor = "pointer";
  startPauseButton.addEventListener("click", () => {
    state.isRunning = !state.isRunning;
    startPauseButton.textContent = state.isRunning ? "Pause" : "Start";
  });
  body.appendChild(startPauseButton);

  const stepButton = document.createElement("button");
  stepButton.textContent = "Step Tick";
  stepButton.style.padding = "8px 10px";
  stepButton.style.background = "#1d2f3a";
  stepButton.style.color = "#f5f5f5";
  stepButton.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  stepButton.style.borderRadius = "6px";
  stepButton.style.cursor = "pointer";
  stepButton.addEventListener("click", () => {
    state.isRunning = false;
    startPauseButton.textContent = "Start";
    stepRequested = true;
  });
  body.appendChild(stepButton);

  const restartButton = document.createElement("button");
  restartButton.textContent = "Restart";
  restartButton.style.padding = "8px 10px";
  restartButton.style.background = "#2a1f1f";
  restartButton.style.color = "#f5f5f5";
  restartButton.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  restartButton.style.borderRadius = "6px";
  restartButton.style.cursor = "pointer";
  restartButton.addEventListener("click", () => {
    restartRequested = true;
    state.isRunning = false;
    startPauseButton.textContent = "Start";
  });
  body.appendChild(restartButton);

  const resetViewButton = document.createElement("button");
  resetViewButton.textContent = "Reset View";
  resetViewButton.style.padding = "8px 10px";
  resetViewButton.style.background = "#1d2432";
  resetViewButton.style.color = "#f5f5f5";
  resetViewButton.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  resetViewButton.style.borderRadius = "6px";
  resetViewButton.style.cursor = "pointer";
  resetViewButton.addEventListener("click", () => {
    resetViewRequested = true;
  });
  body.appendChild(resetViewButton);

  const strategyRow = createControlRow("Strategy");
  const strategySelect = document.createElement("select");
  strategySelect.style.padding = "7px 8px";
  strategySelect.style.background = "#10242a";
  strategySelect.style.color = "#f5f5f5";
  strategySelect.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  strategySelect.style.borderRadius = "6px";

  const strategies: StrategyMode[] = ["aggressive", "defensive", "balanced"];
  for (const strategy of strategies) {
    const option = document.createElement("option");
    option.value = strategy;
    option.textContent = strategy[0].toUpperCase() + strategy.slice(1);
    if (strategy === state.strategy) {
      option.selected = true;
    }
    strategySelect.appendChild(option);
  }

  strategySelect.addEventListener("change", () => {
    state.strategy = strategySelect.value as StrategyMode;
  });
  strategyRow.appendChild(strategySelect);
  body.appendChild(strategyRow);

  const modeRow = createControlRow("Allied Control");
  const modeSelect = document.createElement("select");
  modeSelect.style.padding = "7px 8px";
  modeSelect.style.background = "#10242a";
  modeSelect.style.color = "#f5f5f5";
  modeSelect.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  modeSelect.style.borderRadius = "6px";
  const modes: Array<{ value: CommandMode; label: string }> = [
    { value: "auto", label: "AI Auto" },
    { value: "training", label: "Training" },
  ];
  for (const mode of modes) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    if (mode.value === state.commandMode) {
      option.selected = true;
    }
    modeSelect.appendChild(option);
  }
  modeSelect.addEventListener("change", () => {
    state.commandMode = modeSelect.value as CommandMode;
  });
  modeRow.appendChild(modeSelect);
  body.appendChild(modeRow);

  const speedRow = createControlRow("Speed");
  const speedValue = document.createElement("span");
  speedValue.textContent = "1.0x";
  speedValue.style.fontSize = "11px";
  speedValue.style.color = "#b8c7cc";

  const speedSlider = document.createElement("input");
  speedSlider.type = "range";
  speedSlider.min = "0.5";
  speedSlider.max = "3";
  speedSlider.step = "0.1";
  speedSlider.value = String(state.speedMultiplier);
  speedSlider.addEventListener("input", () => {
    state.speedMultiplier = Number(speedSlider.value);
    speedValue.textContent = `${state.speedMultiplier.toFixed(1)}x`;
  });

  speedRow.appendChild(speedSlider);
  speedRow.appendChild(speedValue);
  body.appendChild(speedRow);

  const resizeGrip = document.createElement("div");
  resizeGrip.style.position = "absolute";
  resizeGrip.style.right = "5px";
  resizeGrip.style.bottom = "5px";
  resizeGrip.style.width = "12px";
  resizeGrip.style.height = "12px";
  resizeGrip.style.borderRight = "2px solid rgba(255, 255, 255, 0.24)";
  resizeGrip.style.borderBottom = "2px solid rgba(255, 255, 255, 0.24)";
  resizeGrip.style.pointerEvents = "none";
  panel.appendChild(resizeGrip);

  function clampPanelToContainer(): void {
    const maxLeft = Math.max(0, container.clientWidth - panel.offsetWidth);
    const maxTop = Math.max(0, container.clientHeight - panel.offsetHeight);
    const currentLeft = panel.offsetLeft;
    const currentTop = panel.offsetTop;

    if (panel.style.left) {
      panel.style.left = `${Math.min(Math.max(0, currentLeft), maxLeft)}px`;
    }

    if (panel.style.top) {
      panel.style.top = `${Math.min(Math.max(0, currentTop), maxTop)}px`;
    }
  }

  header.addEventListener("pointerdown", (event) => {
    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    panel.style.left = `${panelRect.left - containerRect.left}px`;
    panel.style.top = `${panelRect.top - containerRect.top}px`;
    panel.style.right = "auto";
    panel.dataset.modalDetached = "true";

    dragOffsetX = event.clientX - panelRect.left;
    dragOffsetY = event.clientY - panelRect.top;
    isDragging = true;
    header.setPointerCapture(event.pointerId);
  });

  header.addEventListener("pointermove", (event) => {
    if (!isDragging) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const maxLeft = Math.max(0, container.clientWidth - panel.offsetWidth);
    const maxTop = Math.max(0, container.clientHeight - panel.offsetHeight);
    const nextLeft = event.clientX - containerRect.left - dragOffsetX;
    const nextTop = event.clientY - containerRect.top - dragOffsetY;

    panel.style.left = `${Math.min(Math.max(0, nextLeft), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(0, nextTop), maxTop)}px`;
  });

  header.addEventListener("pointerup", (event) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    header.releasePointerCapture(event.pointerId);
  });

  header.addEventListener("pointercancel", (event) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    header.releasePointerCapture(event.pointerId);
  });

  window.addEventListener("resize", clampPanelToContainer);

  const fogRow = document.createElement("label");
  fogRow.style.display = "flex";
  fogRow.style.alignItems = "center";
  fogRow.style.gap = "8px";
  fogRow.style.fontSize = "12px";
  fogRow.style.color = "#e0e0e0";
  fogRow.style.cursor = "pointer";

  const showHiddenEnemiesCheckbox = document.createElement("input");
  showHiddenEnemiesCheckbox.type = "checkbox";
  showHiddenEnemiesCheckbox.checked = state.showHiddenEnemies;
  showHiddenEnemiesCheckbox.addEventListener("change", () => {
    state.showHiddenEnemies = showHiddenEnemiesCheckbox.checked;
  });

  fogRow.appendChild(showHiddenEnemiesCheckbox);
  fogRow.appendChild(document.createTextNode("Show hidden enemies"));
  panel.appendChild(fogRow);

  container.style.position = "relative";
  container.appendChild(panel);

  return {
    root: panel,
    getState: () => ({ ...state }),
    consumeRestartRequest: () => {
      const wasRequested = restartRequested;
      restartRequested = false;
      return wasRequested;
    },
    consumeResetViewRequest: () => {
      const wasRequested = resetViewRequested;
      resetViewRequested = false;
      return wasRequested;
    },
    consumeStepRequest: () => {
      const wasRequested = stepRequested;
      stepRequested = false;
      return wasRequested;
    },
  };
}
