import type { ResourceAssignment } from "../engine/allocation";
import type {
  AlliedCity,
  AlliedSpawnZone,
  MobilePlatform,
} from "../models/entity";
import type {
  CommandMode,
  TrainingDeployRequest,
} from "../models/training";
import {
  getPlatformDisplayName,
  isPlatformDeployed,
  isPlatformStored,
} from "../models/platform-utils";

type TrainingPanelApi = {
  update: (input: {
    commandMode: CommandMode;
    alliedCities: AlliedCity[];
    alliedSpawnZones: AlliedSpawnZone[];
    alliedPlatforms: MobilePlatform[];
    enemyPlatforms: MobilePlatform[];
    operatorAssignments: ResourceAssignment[];
    advisorAssignments: ResourceAssignment[];
    feedbackMessages: string[];
  }) => void;
  consumeDeployRequest: () => TrainingDeployRequest | undefined;
  consumeRecallRequest: () => string | undefined;
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function createSection(title: string, subtitle: string): HTMLElement {
  const section = document.createElement("section");
  setStyles(section, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  const header = document.createElement("div");
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  setStyles(titleElement, {
    color: "#f5f5f5",
    fontSize: "13px",
    lineHeight: "1.2",
  });
  const subtitleElement = document.createElement("div");
  subtitleElement.textContent = subtitle;
  setStyles(subtitleElement, {
    color: "#8fa8b1",
    fontSize: "11px",
    lineHeight: "1.3",
  });
  header.appendChild(titleElement);
  header.appendChild(subtitleElement);
  section.appendChild(header);

  return section;
}

function createSelectRow(label: string): {
  row: HTMLDivElement;
  select: HTMLSelectElement;
} {
  const row = document.createElement("div");
  setStyles(row, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });
  const labelElement = document.createElement("label");
  labelElement.textContent = label;
  setStyles(labelElement, {
    color: "#e0e0e0",
    fontSize: "12px",
  });
  const select = document.createElement("select");
  setStyles(select, {
    padding: "7px 8px",
    background: "#10242a",
    color: "#f5f5f5",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "6px",
  });
  row.appendChild(labelElement);
  row.appendChild(select);
  return { row, select };
}

function createButton(label: string, background: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  setStyles(button, {
    padding: "8px 10px",
    background,
    color: "#f5f5f5",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
  });
  return button;
}

function createListCard(text: string, tone: "info" | "warning" | "success" = "info"): HTMLDivElement {
  const card = document.createElement("div");
  const borderColor =
    tone === "warning" ? "#ffd166" : tone === "success" ? "#74d680" : "#8fa8b1";
  setStyles(card, {
    padding: "8px",
    border: `1px solid ${borderColor}44`,
    borderRadius: "7px",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#dfe9ec",
    fontSize: "12px",
    lineHeight: "1.35",
  });
  card.textContent = text;
  return card;
}

export function createTrainingPanel(container: HTMLElement): TrainingPanelApi {
  let pendingDeployRequest: TrainingDeployRequest | undefined;
  let pendingRecallRequest: string | undefined;
  let isDragging = false;
  let isCollapsed = false;
  let expandedHeight = "min(50vh, 620px)";
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const panel = document.createElement("aside");
  setStyles(panel, {
    position: "absolute",
    top: "300px",
    right: "16px",
    zIndex: "15",
    width: "300px",
    height: "min(50vh, 620px)",
    minWidth: "280px",
    minHeight: "200px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100vh - 32px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    resize: "both",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "8px",
    background: "rgba(8, 20, 24, 0.92)",
    backdropFilter: "blur(2px)",
    fontFamily: "Arial, sans-serif",
  });
  const header = document.createElement("div");
  setStyles(header, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    cursor: "move",
    userSelect: "none",
  });
  panel.appendChild(header);

  const title = document.createElement("strong");
  title.textContent = "Operator Training";
  setStyles(title, {
    color: "#f5f5f5",
    fontSize: "14px",
  });
  header.appendChild(title);

  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.textContent = "Collapse";
  setStyles(collapseButton, {
    padding: "5px 8px",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.07)",
    color: "#dfe9ec",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: "700",
  });
  header.appendChild(collapseButton);

  const content = document.createElement("div");
  setStyles(content, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px",
    overflowY: "auto",
    minHeight: "0",
    flex: "1",
  });
  panel.appendChild(content);

  const modeSummary = document.createElement("div");
  setStyles(modeSummary, {
    color: "#9fb6be",
    fontSize: "11px",
    lineHeight: "1.35",
  });
  content.appendChild(modeSummary);

  const commandSection = createSection(
    "Manual deployment",
    "Select a base asset, choose a mission, and issue a user-owned allied command.",
  );
  const baseRow = createSelectRow("Base");
  const platformRow = createSelectRow("Platform");
  const missionRow = createSelectRow("Mission");
  const targetRow = createSelectRow("Target");
  const deployButton = createButton("Deploy Command", "#1f3a2e");
  const recallRow = createSelectRow("Recall active platform");
  const recallButton = createButton("Recall Platform", "#3a2f1f");

  const missionOptions: Array<{ value: "intercept" | "reinforce"; label: string }> = [
    { value: "intercept", label: "Intercept enemy" },
    { value: "reinforce", label: "Reinforce city" },
  ];
  for (const optionConfig of missionOptions) {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    missionRow.select.appendChild(option);
  }

  commandSection.appendChild(baseRow.row);
  commandSection.appendChild(platformRow.row);
  commandSection.appendChild(missionRow.row);
  commandSection.appendChild(targetRow.row);
  commandSection.appendChild(deployButton);
  commandSection.appendChild(recallRow.row);
  commandSection.appendChild(recallButton);
  content.appendChild(commandSection);

  const feedbackSection = createSection(
    "AI coaching",
    "Recommendations and critiques based on the current threat picture.",
  );
  const feedbackList = document.createElement("div");
  setStyles(feedbackList, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });
  feedbackSection.appendChild(feedbackList);
  content.appendChild(feedbackSection);

  const recommendationSection = createSection(
    "Recommended actions",
    "Top AI suggestions from the current decision engine. These do not auto-execute in training mode.",
  );
  const recommendationList = document.createElement("div");
  setStyles(recommendationList, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });
  recommendationSection.appendChild(recommendationList);
  content.appendChild(recommendationSection);

  const activeSection = createSection(
    "Operator-issued commands",
    "Active allied missions currently being executed under user control.",
  );
  const activeList = document.createElement("div");
  setStyles(activeList, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });
  activeSection.appendChild(activeList);
  content.appendChild(activeSection);

  container.appendChild(panel);

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

  function syncCollapsedState(): void {
    collapseButton.textContent = isCollapsed ? "Expand" : "Collapse";
    collapseButton.setAttribute("aria-expanded", String(!isCollapsed));
    content.style.display = isCollapsed ? "none" : "flex";
    panel.style.height = isCollapsed ? "auto" : expandedHeight;
    panel.style.minHeight = isCollapsed ? "0" : "200px";
    panel.style.resize = isCollapsed ? "none" : "both";
    if (!isCollapsed) {
      clampPanelToContainer();
    }
  }

  function replaceSelectOptions(
    select: HTMLSelectElement,
    options: Array<{ value: string; label: string }>,
    preferredValue?: string,
  ): void {
    const currentValue = preferredValue ?? select.value;
    select.replaceChildren();
    for (const optionConfig of options) {
      const option = document.createElement("option");
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      if (optionConfig.value === currentValue) {
        option.selected = true;
      }
      select.appendChild(option);
    }
    if (select.options.length > 0 && select.selectedIndex < 0) {
      select.selectedIndex = 0;
    }
  }

  deployButton.addEventListener("click", () => {
    if (!baseRow.select.value || !platformRow.select.value || !targetRow.select.value) {
      return;
    }
    pendingDeployRequest = {
      resourceId: platformRow.select.value,
      mission: missionRow.select.value as "intercept" | "reinforce",
      targetId: targetRow.select.value,
    };
  });

  recallButton.addEventListener("click", () => {
    if (!recallRow.select.value) {
      return;
    }
    pendingRecallRequest = recallRow.select.value;
  });

  header.addEventListener("pointerdown", (event) => {
    if (event.target instanceof HTMLButtonElement) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    panel.style.left = `${panelRect.left - containerRect.left}px`;
    panel.style.top = `${panelRect.top - containerRect.top}px`;
    panel.style.right = "auto";

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

  collapseButton.addEventListener("click", () => {
    if (!isCollapsed) {
      expandedHeight = `${panel.getBoundingClientRect().height}px`;
    }
    isCollapsed = !isCollapsed;
    syncCollapsedState();
  });
  syncCollapsedState();

  return {
    consumeDeployRequest: () => {
      const request = pendingDeployRequest;
      pendingDeployRequest = undefined;
      return request;
    },
    consumeRecallRequest: () => {
      const request = pendingRecallRequest;
      pendingRecallRequest = undefined;
      return request;
    },
    update: (input) => {
      modeSummary.textContent =
        input.commandMode === "training"
          ? "Training mode active: allied deployments come from your commands, while AI recommendations remain advisory."
          : "AI auto mode active: the recommendation engine currently owns allied deployments.";

      const baseOptions = input.alliedSpawnZones.map((base) => ({
        value: base.id,
        label: base.name ?? base.id,
      }));
      replaceSelectOptions(baseRow.select, baseOptions);

      const selectedBaseId = baseRow.select.value;
      const storedPlatforms = input.alliedPlatforms.filter(
        (platform) => platform.originId === selectedBaseId && isPlatformStored(platform),
      );
      replaceSelectOptions(
        platformRow.select,
        storedPlatforms.map((platform) => ({
          value: platform.id,
          label: getPlatformDisplayName(platform),
        })),
      );

      const targetOptions =
        missionRow.select.value === "intercept"
          ? input.enemyPlatforms
              .filter(isPlatformDeployed)
              .map((platform) => ({
              value: platform.id,
              label: `${getPlatformDisplayName(platform)} (${platform.status})`,
            }))
          : input.alliedCities.map((city) => ({
              value: city.id,
              label: city.name ?? city.id,
            }));
      replaceSelectOptions(targetRow.select, targetOptions);

      const recallablePlatforms = input.alliedPlatforms.filter(
        (platform) =>
          isPlatformDeployed(platform) &&
          input.operatorAssignments.some(
            (assignment) => assignment.resourceId === platform.id,
          ),
      );
      replaceSelectOptions(
        recallRow.select,
        recallablePlatforms.map((platform) => ({
          value: platform.id,
          label: getPlatformDisplayName(platform),
        })),
      );

      const disabled = input.commandMode !== "training";
      for (const control of [
        baseRow.select,
        platformRow.select,
        missionRow.select,
        targetRow.select,
        recallRow.select,
        deployButton,
        recallButton,
      ]) {
        control.disabled = disabled;
      }

      feedbackList.replaceChildren();
      const feedbackMessages =
        input.feedbackMessages.length > 0
          ? input.feedbackMessages
          : [
              input.commandMode === "training"
                ? "Awaiting operator action. The AI advisor will flag urgent gaps and recommended intercepts."
                : "Switch to Training mode to take direct control and receive decision coaching.",
            ];
      for (const message of feedbackMessages.slice(0, 4)) {
        feedbackList.appendChild(
          createListCard(
            message,
            message.toLowerCase().includes("recommend") ||
              message.toLowerCase().includes("urgent")
              ? "warning"
              : "info",
          ),
        );
      }

      recommendationList.replaceChildren();
      if (input.advisorAssignments.length === 0) {
        recommendationList.appendChild(
          createListCard("No active AI recommendation bundle at this moment."),
        );
      } else {
        for (const assignment of input.advisorAssignments.slice(0, 3)) {
          recommendationList.appendChild(
            createListCard(
              `${assignment.mission === "intercept" ? "Intercept" : "Reinforce"}: ` +
                `${assignment.resourceName} -> ${assignment.targetName}. ${assignment.reason}`,
              "warning",
            ),
          );
        }
      }

      activeList.replaceChildren();
      if (input.operatorAssignments.length === 0) {
        activeList.appendChild(
          createListCard(
            input.commandMode === "training"
              ? "No operator-issued commands are active."
              : "Operator commands are inactive while AI auto mode is selected.",
          ),
        );
      } else {
        for (const assignment of input.operatorAssignments.slice(0, 5)) {
          activeList.appendChild(
            createListCard(
              `${assignment.resourceName} -> ${assignment.targetName} (${assignment.mission})`,
              "success",
            ),
          );
        }
      }
    },
  };
}
