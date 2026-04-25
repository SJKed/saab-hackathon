import {
  getScenarioById,
  scenarioPresets,
  type ScenarioPreset,
} from "../models/scenario";

type ScenarioPickerApi = {
  open: () => void;
  close: () => void;
  getSelectedScenario: () => ScenarioPreset;
  setOnStart: (handler: (scenario: ScenarioPreset) => void) => void;
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export function createScenarioPicker(container: HTMLElement): ScenarioPickerApi {
  const overlay = document.createElement("div");
  setStyles(overlay, {
    position: "absolute",
    inset: "0",
    zIndex: "60",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.45)",
    backdropFilter: "blur(2px)",
  });

  const card = document.createElement("section");
  setStyles(card, {
    width: "min(640px, calc(100vw - 32px))",
    maxHeight: "min(84vh, 760px)",
    overflowY: "auto",
    padding: "16px",
    borderRadius: "10px",
    border: "1px solid rgba(180, 215, 235, 0.2)",
    background: "rgba(8, 20, 24, 0.96)",
    color: "#e5eef2",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  });
  overlay.appendChild(card);

  const title = document.createElement("h2");
  title.textContent = "Select Mission Scenario";
  setStyles(title, { margin: "0", fontSize: "18px" });
  card.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.textContent =
    "Pick a curated mission profile before starting the simulation.";
  setStyles(subtitle, {
    margin: "0",
    color: "#9fb6be",
    fontSize: "12px",
    lineHeight: "1.4",
  });
  card.appendChild(subtitle);

  const list = document.createElement("div");
  setStyles(list, { display: "flex", flexDirection: "column", gap: "8px" });
  card.appendChild(list);

  let selectedScenario = scenarioPresets[0];
  let onStart: (scenario: ScenarioPreset) => void = () => undefined;
  const optionButtons: HTMLButtonElement[] = [];

  for (const scenario of scenarioPresets) {
    const button = document.createElement("button");
    button.type = "button";
    setStyles(button, {
      border: "1px solid rgba(255, 255, 255, 0.14)",
      borderRadius: "8px",
      background: "rgba(255, 255, 255, 0.04)",
      color: "#e5eef2",
      textAlign: "left",
      padding: "10px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    });
    button.innerHTML = `<strong>${scenario.name}</strong><span>${scenario.description}</span><small>${scenario.briefing}</small>`;
    list.appendChild(button);
    optionButtons.push(button);
    button.addEventListener("click", () => {
      selectedScenario = { ...getScenarioById(scenario.id), objective: { ...scenario.objective } };
      for (const optionButton of optionButtons) {
        optionButton.style.borderColor = "rgba(255, 255, 255, 0.14)";
      }
      button.style.borderColor = "#74d680";
    });
  }
  optionButtons[0].style.borderColor = "#74d680";

  const durationRow = document.createElement("div");
  setStyles(durationRow, {
    display: "grid",
    gridTemplateColumns: "1fr 140px",
    gap: "8px",
    alignItems: "center",
  });
  const durationLabel = document.createElement("label");
  durationLabel.textContent = "Scenario max ticks";
  setStyles(durationLabel, { fontSize: "12px", color: "#c7d5da" });
  const durationInput = document.createElement("input");
  durationInput.type = "text";
  durationInput.placeholder = "e.g. 400 or infinite";
  durationInput.value = String(selectedScenario.objective.maxTicks ?? "infinite");
  setStyles(durationInput, {
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.06)",
    color: "#e5eef2",
  });
  durationRow.appendChild(durationLabel);
  durationRow.appendChild(durationInput);
  card.appendChild(durationRow);

  const durationPresets = document.createElement("div");
  setStyles(durationPresets, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "-4px",
  });
  const presetValues = ["220", "320", "420", "infinite"];
  for (const preset of presetValues) {
    const presetButton = document.createElement("button");
    presetButton.type = "button";
    presetButton.textContent = preset;
    setStyles(presetButton, {
      padding: "4px 8px",
      borderRadius: "6px",
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.05)",
      color: "#dfe9ec",
      fontSize: "11px",
      cursor: "pointer",
    });
    presetButton.addEventListener("click", () => {
      durationInput.value = preset;
    });
    durationPresets.appendChild(presetButton);
  }
  card.appendChild(durationPresets);

  const actionRow = document.createElement("div");
  setStyles(actionRow, {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  });
  card.appendChild(actionRow);

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = "Start Mission";
  setStyles(startButton, {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid rgba(116, 214, 128, 0.4)",
    background: "rgba(116, 214, 128, 0.16)",
    color: "#e5eef2",
    cursor: "pointer",
    fontWeight: "700",
  });
  actionRow.appendChild(startButton);

  startButton.addEventListener("click", () => {
    const value = durationInput.value.trim().toLowerCase();
    if (value === "infinite" || value === "inf" || value === "infinity") {
      selectedScenario = {
        ...selectedScenario,
        objective: { ...selectedScenario.objective, maxTicks: null },
      };
    } else {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        selectedScenario = {
          ...selectedScenario,
          objective: { ...selectedScenario.objective, maxTicks: Math.floor(parsed) },
        };
      }
    }
    onStart(selectedScenario);
    overlay.style.display = "none";
  });

  container.appendChild(overlay);

  return {
    open: () => {
      overlay.style.display = "flex";
    },
    close: () => {
      overlay.style.display = "none";
    },
    getSelectedScenario: () => selectedScenario,
    setOnStart: (handler) => {
      onStart = handler;
    },
  };
}
