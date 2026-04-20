export type StrategyMode = "aggressive" | "defensive" | "balanced";

export type ControlsState = {
  isRunning: boolean;
  strategy: StrategyMode;
  speedMultiplier: number;
};

type ControlsApi = {
  getState: () => ControlsState;
  consumeRestartRequest: () => boolean;
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
    isRunning: true,
    strategy: "balanced",
    speedMultiplier: 1,
  };
  let restartRequested = false;

  const panel = document.createElement("aside");
  panel.style.position = "absolute";
  panel.style.top = "16px";
  panel.style.right = "16px";
  panel.style.width = "220px";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = "12px";
  panel.style.padding = "12px";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  panel.style.borderRadius = "8px";
  panel.style.background = "rgba(8, 20, 24, 0.9)";
  panel.style.backdropFilter = "blur(2px)";
  panel.style.fontFamily = "Arial, sans-serif";

  const title = document.createElement("strong");
  title.textContent = "Simulation Controls";
  title.style.color = "#f5f5f5";
  title.style.fontSize = "14px";
  panel.appendChild(title);

  const startPauseButton = document.createElement("button");
  startPauseButton.textContent = "Pause";
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
  panel.appendChild(startPauseButton);

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
    state.isRunning = true;
    startPauseButton.textContent = "Pause";
  });
  panel.appendChild(restartButton);

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
  panel.appendChild(strategyRow);

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
  panel.appendChild(speedRow);

  container.style.position = "relative";
  container.appendChild(panel);

  return {
    getState: () => ({ ...state }),
    consumeRestartRequest: () => {
      const wasRequested = restartRequested;
      restartRequested = false;
      return wasRequested;
    },
  };
}
