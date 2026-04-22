import type { ResourceAssignment } from "../engine/allocation";
import type { CombatLogEvent } from "../engine/combat";

type InfoPanelApi = {
  update: (assignments: ResourceAssignment[], events: CombatLogEvent[]) => void;
};

type Tone = {
  label: string;
  color: string;
  background: string;
  border: string;
};

type PanelSection = {
  root: HTMLElement;
  content: HTMLDivElement;
};

const lowTone: Tone = {
  label: "Low",
  color: "#74d680",
  background: "rgba(116, 214, 128, 0.12)",
  border: "rgba(116, 214, 128, 0.32)",
};

const mediumTone: Tone = {
  label: "Elevated",
  color: "#ffd166",
  background: "rgba(255, 209, 102, 0.13)",
  border: "rgba(255, 209, 102, 0.34)",
};

const highTone: Tone = {
  label: "High",
  color: "#ff6b6b",
  background: "rgba(255, 107, 107, 0.14)",
  border: "rgba(255, 107, 107, 0.34)",
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function getThreatTone(score: number): Tone {
  if (score >= 0.75) {
    return highTone;
  }

  if (score >= 0.35) {
    return mediumTone;
  }

  return lowTone;
}

function getPriorityTone(score: number): Tone {
  if (score >= 8) {
    return highTone;
  }

  if (score >= 5) {
    return mediumTone;
  }

  return lowTone;
}

function getEventTone(event: CombatLogEvent): Tone {
  const normalizedMessage = event.message.toLowerCase();
  if (normalizedMessage.includes("destroyed")) {
    return highTone;
  }

  if (normalizedMessage.includes("engaged")) {
    return mediumTone;
  }

  return lowTone;
}

function createPill(label: string, tone: Tone): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.textContent = label;
  setStyles(pill, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "20px",
    padding: "2px 7px",
    border: `1px solid ${tone.border}`,
    borderRadius: "999px",
    background: tone.background,
    color: tone.color,
    fontSize: "10px",
    fontWeight: "700",
    lineHeight: "1",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  });
  return pill;
}

function createMetricCard(label: string, value: string, tone: Tone): HTMLDivElement {
  const card = document.createElement("div");
  setStyles(card, {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    minWidth: "0",
    padding: "8px",
    border: `1px solid ${tone.border}`,
    borderRadius: "7px",
    background: tone.background,
  });

  const labelElement = document.createElement("div");
  labelElement.textContent = label;
  setStyles(labelElement, {
    color: "#9fb6be",
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0",
    textTransform: "uppercase",
  });
  card.appendChild(labelElement);

  const valueElement = document.createElement("div");
  valueElement.textContent = value;
  setStyles(valueElement, {
    color: tone.color,
    fontSize: "16px",
    fontWeight: "800",
    lineHeight: "1",
  });
  card.appendChild(valueElement);

  return card;
}

function createSection(title: string, subtitle: string): PanelSection {
  const root = document.createElement("section");
  setStyles(root, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  const header = document.createElement("div");
  setStyles(header, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  });

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  setStyles(titleElement, {
    color: "#f5f5f5",
    fontSize: "13px",
    lineHeight: "1.2",
  });
  header.appendChild(titleElement);

  const subtitleElement = document.createElement("div");
  subtitleElement.textContent = subtitle;
  setStyles(subtitleElement, {
    color: "#8fa8b1",
    fontSize: "11px",
    lineHeight: "1.25",
  });
  header.appendChild(subtitleElement);

  const content = document.createElement("div");
  setStyles(content, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  root.appendChild(header);
  root.appendChild(content);

  return { root, content };
}

function createEmptyState(text: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.textContent = text;
  setStyles(empty, {
    padding: "10px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "7px",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#b8c7cc",
    fontSize: "12px",
    lineHeight: "1.35",
  });
  return empty;
}

function createAssignmentCard(assignment: ResourceAssignment): HTMLElement {
  const missionTone = assignment.mission === "intercept" ? mediumTone : lowTone;
  const missionLabel = assignment.mission === "intercept" ? "Intercept" : "Reinforce";
  const threatTone = getThreatTone(assignment.threatScore);
  const priorityTone = getPriorityTone(assignment.priorityScore);

  const item = document.createElement("article");
  setStyles(item, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "10px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderLeft: `3px solid ${missionTone.color}`,
    borderRadius: "7px",
    background: "linear-gradient(180deg, rgba(16, 36, 42, 0.82), rgba(8, 20, 24, 0.76))",
    boxShadow: "0 10px 20px rgba(0, 0, 0, 0.18)",
  });

  const header = document.createElement("div");
  setStyles(header, {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "8px",
  });

  const route = document.createElement("div");
  setStyles(route, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: "0",
  });

  const routeTitle = document.createElement("div");
  routeTitle.textContent = `${assignment.resourceName} -> ${assignment.targetName}`;
  setStyles(routeTitle, {
    color: "#f5f5f5",
    fontSize: "12px",
    fontWeight: "800",
    lineHeight: "1.25",
    overflowWrap: "anywhere",
  });
  route.appendChild(routeTitle);

  const routeMeta = document.createElement("div");
  routeMeta.textContent = `${assignment.distance.toFixed(0)} px projected path`;
  setStyles(routeMeta, {
    color: "#9fb6be",
    fontSize: "11px",
  });
  route.appendChild(routeMeta);

  header.appendChild(route);
  header.appendChild(createPill(missionLabel, missionTone));
  item.appendChild(header);

  const explanationBlock = document.createElement("div");
  setStyles(explanationBlock, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px",
    borderRadius: "7px",
    background: "rgba(255, 255, 255, 0.045)",
  });

  const explanationHeading = document.createElement("div");
  explanationHeading.textContent = "Resource Assignment Explanation";
  setStyles(explanationHeading, {
    color: "#dfe9ec",
    fontSize: "11px",
    fontWeight: "800",
  });
  explanationBlock.appendChild(explanationHeading);

  const explanation = document.createElement("div");
  explanation.textContent = assignment.reason;
  setStyles(explanation, {
    color: "#c7d5da",
    fontSize: "12px",
    lineHeight: "1.35",
  });
  explanationBlock.appendChild(explanation);
  item.appendChild(explanationBlock);

  const scoreGrid = document.createElement("div");
  setStyles(scoreGrid, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  });
  scoreGrid.appendChild(
    createMetricCard(
      `Threat Score - ${threatTone.label}`,
      assignment.threatScore.toFixed(3),
      threatTone,
    ),
  );
  scoreGrid.appendChild(
    createMetricCard(
      `Priority Score - ${priorityTone.label}`,
      assignment.priorityScore.toFixed(2),
      priorityTone,
    ),
  );
  item.appendChild(scoreGrid);

  return item;
}

function createEventItem(event: CombatLogEvent): HTMLDivElement {
  const tone = getEventTone(event);
  const eventItem = document.createElement("div");
  setStyles(eventItem, {
    display: "grid",
    gridTemplateColumns: "54px minmax(0, 1fr)",
    gap: "8px",
    alignItems: "start",
    padding: "8px",
    border: `1px solid ${tone.border}`,
    borderRadius: "7px",
    background: "rgba(16, 36, 42, 0.48)",
  });

  const tickLabel = document.createElement("div");
  tickLabel.textContent = `T${event.tick}`;
  setStyles(tickLabel, {
    color: tone.color,
    fontSize: "11px",
    fontWeight: "800",
    whiteSpace: "nowrap",
  });
  eventItem.appendChild(tickLabel);

  const eventText = document.createElement("div");
  eventText.textContent = event.message;
  setStyles(eventText, {
    color: "#e5eef2",
    fontSize: "12px",
    lineHeight: "1.35",
    overflowWrap: "anywhere",
  });
  eventItem.appendChild(eventText);

  return eventItem;
}

export function createInfoPanel(container: HTMLElement): InfoPanelApi {
  const panel = document.createElement("aside");
  setStyles(panel, {
    position: "absolute",
    right: "16px",
    bottom: "16px",
    zIndex: "20",
    width: "min(430px, calc(100vw - 32px))",
    height: "min(520px, 52vh)",
    minWidth: "300px",
    minHeight: "220px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100vh - 32px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    resize: "both",
    border: "1px solid rgba(180, 215, 235, 0.18)",
    borderRadius: "8px",
    background: "rgba(8, 20, 24, 0.91)",
    boxShadow: "0 18px 42px rgba(0, 0, 0, 0.34)",
    backdropFilter: "blur(5px)",
    color: "#e5eef2",
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

  const titleGroup = document.createElement("div");
  setStyles(titleGroup, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "0",
  });
  header.appendChild(titleGroup);

  const title = document.createElement("strong");
  title.textContent = "Explainability";
  setStyles(title, {
    color: "#f5f5f5",
    fontSize: "14px",
    lineHeight: "1.15",
  });
  titleGroup.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Assignments, scores, and combat events";
  setStyles(subtitle, {
    color: "#8fa8b1",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  titleGroup.appendChild(subtitle);

  const headerActions = document.createElement("div");
  setStyles(headerActions, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });
  header.appendChild(headerActions);

  const assignmentCount = createPill("0 Active", lowTone);
  headerActions.appendChild(assignmentCount);

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
  headerActions.appendChild(collapseButton);

  const body = document.createElement("div");
  setStyles(body, {
    minHeight: "0",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px",
  });
  panel.appendChild(body);

  const assignmentsSection = createSection(
    "Resource Assignment Explanation",
    "Why each resource is intercepting or reinforcing.",
  );
  body.appendChild(assignmentsSection.root);

  const eventSection = createSection(
    "Combat Event Log",
    "Recent engagements and losses from the simulation.",
  );
  body.appendChild(eventSection.root);

  const resizeGrip = document.createElement("div");
  setStyles(resizeGrip, {
    position: "absolute",
    right: "5px",
    bottom: "5px",
    width: "12px",
    height: "12px",
    borderRight: "2px solid rgba(255, 255, 255, 0.24)",
    borderBottom: "2px solid rgba(255, 255, 255, 0.24)",
    pointerEvents: "none",
  });
  panel.appendChild(resizeGrip);

  container.appendChild(panel);

  let isDragging = false;
  let isCollapsed = false;
  let expandedHeight = "";
  let dragOffsetX = 0;
  let dragOffsetY = 0;

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

  function setCollapsed(nextCollapsed: boolean): void {
    isCollapsed = nextCollapsed;

    if (isCollapsed) {
      expandedHeight = `${panel.offsetHeight}px`;
      body.style.display = "none";
      resizeGrip.style.display = "none";
      panel.style.height = "auto";
      panel.style.minHeight = "0";
      panel.style.resize = "none";
      collapseButton.textContent = "Expand";
    } else {
      body.style.display = "flex";
      resizeGrip.style.display = "block";
      panel.style.minHeight = "220px";
      panel.style.height = expandedHeight || "min(520px, 52vh)";
      panel.style.resize = "both";
      collapseButton.textContent = "Collapse";
      clampPanelToContainer();
    }
  }

  header.addEventListener("pointerdown", (event) => {
    if (event.target instanceof HTMLButtonElement) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    panel.style.left = `${panelRect.left - containerRect.left}px`;
    panel.style.top = `${panelRect.top - containerRect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

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
    setCollapsed(!isCollapsed);
  });

  window.addEventListener("resize", clampPanelToContainer);

  const render = (assignments: ResourceAssignment[], events: CombatLogEvent[]): void => {
    assignmentsSection.content.innerHTML = "";
    eventSection.content.innerHTML = "";

    const assignmentTone =
      assignments.length === 0 ? lowTone : assignments.length <= 2 ? mediumTone : highTone;
    assignmentCount.textContent = `${assignments.length} Active`;
    setStyles(assignmentCount, {
      color: assignmentTone.color,
      background: assignmentTone.background,
      borderColor: assignmentTone.border,
    });

    if (assignments.length === 0) {
      assignmentsSection.content.appendChild(
        createEmptyState("No active assignments. Start the simulation to generate decisions."),
      );
    } else {
      for (const assignment of assignments) {
        assignmentsSection.content.appendChild(createAssignmentCard(assignment));
      }
    }

    if (events.length === 0) {
      eventSection.content.appendChild(createEmptyState("No combat events yet."));
    } else {
      for (const event of events.slice(0, 12)) {
        eventSection.content.appendChild(createEventItem(event));
      }
    }
  };

  render([], []);

  return {
    update: render,
  };
}
