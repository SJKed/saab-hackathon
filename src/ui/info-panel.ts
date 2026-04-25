import type { ResourceAssignment } from "../engine/allocation";
import type { CombatLogEvent } from "../engine/combat";
import type { EnemyDirectorSnapshot } from "../engine/enemy-director";
import type { ResponsePlannerSnapshot } from "../engine/planning";
import type { AlliedForcePostureSnapshot } from "../engine/posture";

type InfoPanelApi = {
  root: HTMLElement;
  update: (
    assignments: ResourceAssignment[],
    events: CombatLogEvent[],
    alliedPostureSnapshot: AlliedForcePostureSnapshot,
    responsePlannerSnapshot: ResponsePlannerSnapshot,
    directorSnapshot: EnemyDirectorSnapshot,
  ) => void;
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
  const interceptTimeLabel =
    assignment.interceptTimeSeconds === undefined
      ? ""
      : ` | ETA ${assignment.interceptTimeSeconds.toFixed(1)} s`;
  const weaponLabel = assignment.weaponName ? ` | ${assignment.weaponName}` : "";
  routeMeta.textContent =
    `${assignment.distance.toFixed(0)} px projected path${interceptTimeLabel}${weaponLabel}`;
  setStyles(routeMeta, {
    color: "#9fb6be",
    fontSize: "11px",
  });
  route.appendChild(routeMeta);

  header.appendChild(route);
  const headerPills = document.createElement("div");
  setStyles(headerPills, {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "6px",
  });
  headerPills.appendChild(createPill(missionLabel, missionTone));
  if (assignment.weaponClass) {
    headerPills.appendChild(
      createPill(
        assignment.weaponClass === "airToAirMissile"
          ? "A2A Missile"
          : assignment.weaponClass === "rapidFire"
            ? "Rapid Fire"
            : assignment.weaponClass === "bomb"
              ? "Bomb"
              : assignment.weaponClass === "terminalPayload"
                ? "Terminal Payload"
              : "Weapon",
        assignment.mission === "intercept" ? lowTone : mediumTone,
      ),
    );
  }
  header.appendChild(headerPills);
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
  if (assignment.expectedEffectiveness !== undefined) {
    scoreGrid.appendChild(
      createMetricCard(
        "Weapon Match",
        assignment.expectedEffectiveness.toFixed(2),
        assignment.expectedEffectiveness >= 0.8
          ? lowTone
          : assignment.expectedEffectiveness >= 0.45
            ? mediumTone
            : highTone,
      ),
    );
  }
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

function getAggressionTone(
  directorSnapshot: EnemyDirectorSnapshot,
): Tone {
  switch (directorSnapshot.aggressionTier) {
    case "surge":
      return highTone;
    case "pressure":
      return mediumTone;
    case "opening":
    default:
      return lowTone;
  }
}

function getPostureTone(stance: "standby" | "balanced" | "surging"): Tone {
  switch (stance) {
    case "surging":
      return highTone;
    case "balanced":
      return mediumTone;
    case "standby":
    default:
      return lowTone;
  }
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

  const plannerSection = createSection(
    "Response Planner",
    "Portfolio-level rationale, confidence, and fallback state.",
  );
  body.appendChild(plannerSection.root);

  const postureSection = createSection(
    "Force Posture",
    "Why each side is surging, holding, or standing down.",
  );
  body.appendChild(postureSection.root);

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

  collapseButton.addEventListener("click", () => {
    setCollapsed(!isCollapsed);
  });

  window.addEventListener("resize", clampPanelToContainer);

  const render = (
    assignments: ResourceAssignment[],
    events: CombatLogEvent[],
    alliedPostureSnapshot: AlliedForcePostureSnapshot,
    responsePlannerSnapshot: ResponsePlannerSnapshot,
    directorSnapshot: EnemyDirectorSnapshot,
  ): void => {
    assignmentsSection.content.innerHTML = "";
    plannerSection.content.innerHTML = "";
    postureSection.content.innerHTML = "";
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

    const plannerTone =
      responsePlannerSnapshot.mode === "portfolio-beam"
        ? responsePlannerSnapshot.objectiveScore >= 18
          ? highTone
          : mediumTone
        : lowTone;
    const plannerSummary = createEmptyState(
      `${responsePlannerSnapshot.mode === "portfolio-beam" ? "Portfolio planner active." : "Heuristic fallback active."} ` +
        `${responsePlannerSnapshot.primaryRationale}`,
    );
    setStyles(plannerSummary, {
      border: `1px solid ${plannerTone.border}`,
      background: plannerTone.background,
      color: "#dfe9ec",
    });
    plannerSection.content.appendChild(plannerSummary);

    const plannerMetrics = document.createElement("div");
    setStyles(plannerMetrics, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "8px",
    });
    plannerMetrics.appendChild(
      createMetricCard(
        "Plan Mode",
        responsePlannerSnapshot.mode === "portfolio-beam" ? "Portfolio Beam" : "Fallback",
        plannerTone,
      ),
    );
    plannerMetrics.appendChild(
      createMetricCard(
        "Objective",
        responsePlannerSnapshot.objectiveScore.toFixed(1),
        plannerTone,
      ),
    );
    plannerMetrics.appendChild(
      createMetricCard(
        "Actions Considered",
        `${responsePlannerSnapshot.consideredActionCount}`,
        mediumTone,
      ),
    );
    plannerMetrics.appendChild(
      createMetricCard(
        "Actions Selected",
        `${responsePlannerSnapshot.selectedActionCount}`,
        lowTone,
      ),
    );
    plannerSection.content.appendChild(plannerMetrics);

    if (responsePlannerSnapshot.beliefSummaries.length > 0) {
      const beliefList = document.createElement("div");
      setStyles(beliefList, {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });

      for (const belief of responsePlannerSnapshot.beliefSummaries) {
        const tone =
          belief.confidence >= 0.78
            ? highTone
            : belief.confidence >= 0.55
              ? mediumTone
              : lowTone;
        const item = document.createElement("div");
        item.textContent =
          `Enemy ${belief.enemyId.slice(0, 6)} -> ${belief.targetName} ` +
          `(${(belief.confidence * 100).toFixed(0)}% confidence)`;
        setStyles(item, {
          padding: "8px",
          border: `1px solid ${tone.border}`,
          borderRadius: "7px",
          background: "rgba(255, 255, 255, 0.04)",
          color: tone.color,
          fontSize: "12px",
          fontWeight: "700",
          lineHeight: "1.35",
        });
        beliefList.appendChild(item);
      }

      plannerSection.content.appendChild(beliefList);
    }

    if (responsePlannerSnapshot.alternativeSummary) {
      plannerSection.content.appendChild(
        createEmptyState(responsePlannerSnapshot.alternativeSummary),
      );
    }

    const aggressionTone = getAggressionTone(directorSnapshot);
    const alliedPostureTone = getPostureTone(alliedPostureSnapshot.stance);
    const enemyPostureTone = getPostureTone(directorSnapshot.postureSnapshot.stance);
    const postureMetrics = document.createElement("div");
    setStyles(postureMetrics, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "8px",
    });
    postureMetrics.appendChild(
      createMetricCard("Aggression Tier", directorSnapshot.aggressionLabel, aggressionTone),
    );
    postureMetrics.appendChild(
      createMetricCard(
        "Allied Posture",
        alliedPostureSnapshot.stance === "surging"
          ? "Defensive Surge"
          : alliedPostureSnapshot.stance === "standby"
            ? "Standby Recall"
            : "Balanced Cover",
        alliedPostureTone,
      ),
    );
    postureMetrics.appendChild(
      createMetricCard(
        "Allied Burden",
        `${alliedPostureSnapshot.activeBurdenScore.toFixed(1)} / ${alliedPostureSnapshot.demandScore.toFixed(1)}`,
        alliedPostureTone,
      ),
    );
    postureMetrics.appendChild(
      createMetricCard(
        "Enemy Burden",
        `${directorSnapshot.postureSnapshot.activeBurdenScore.toFixed(1)} / ${directorSnapshot.postureSnapshot.demandScore.toFixed(1)}`,
        enemyPostureTone,
      ),
    );
    postureSection.content.appendChild(postureMetrics);

    const postureNarrative = document.createElement("div");
    setStyles(postureNarrative, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "8px",
    });
    const alliedNarrative = createEmptyState(
      `Allied: ${alliedPostureSnapshot.summary} ` +
        `Incursions ${alliedPostureSnapshot.incursionCount}, recommended airborne ${alliedPostureSnapshot.recommendedActiveCount}, ` +
        `recall ${alliedPostureSnapshot.recallPressureActive ? "armed" : "holding"} ` +
        `(${alliedPostureSnapshot.sustainedSurplusSeconds.toFixed(1)} s).`,
    );
    const enemyNarrative = createEmptyState(
      `Enemy: ${directorSnapshot.postureSnapshot.summary} ` +
        `Opportunities ${directorSnapshot.postureSnapshot.opportunityCount}, cap ${directorSnapshot.activeEnemyCount}/${directorSnapshot.activeEnemyCap}, ` +
        `launch release ${directorSnapshot.postureSnapshot.launchReleaseActive ? "open" : "held"} ` +
        `(${directorSnapshot.postureSnapshot.sustainedDemandSeconds.toFixed(1)} s).`,
    );
    postureNarrative.appendChild(alliedNarrative);
    postureNarrative.appendChild(enemyNarrative);
    postureSection.content.appendChild(postureNarrative);

    if (directorSnapshot.cityExposureScores.length > 0) {
      const exposureList = document.createElement("div");
      setStyles(exposureList, {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });

      for (const cityExposure of directorSnapshot.cityExposureScores) {
        const tone =
          cityExposure.exposure >= 7
            ? highTone
            : cityExposure.exposure >= 5
              ? mediumTone
              : lowTone;
        const row = document.createElement("div");
        setStyles(row, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "8px",
          border: `1px solid ${tone.border}`,
          borderRadius: "7px",
          background: "rgba(16, 36, 42, 0.48)",
        });

        const label = document.createElement("div");
        label.textContent = cityExposure.cityName;
        setStyles(label, {
          color: "#e5eef2",
          fontSize: "12px",
          fontWeight: "700",
          lineHeight: "1.25",
        });
        row.appendChild(label);

        const meta = document.createElement("div");
        meta.textContent = `Exposure ${cityExposure.exposure.toFixed(2)}`;
        setStyles(meta, {
          color: tone.color,
          fontSize: "11px",
          fontWeight: "800",
          lineHeight: "1",
          whiteSpace: "nowrap",
        });
        row.appendChild(meta);
        exposureList.appendChild(row);
      }

      postureSection.content.appendChild(exposureList);
    }

    const alliedCoverageNeeds = alliedPostureSnapshot.cityStates.filter(
      (cityState) => cityState.unmetCoverage > 0.35 || cityState.activeThreatCount > 0,
    );
    if (alliedCoverageNeeds.length > 0) {
      const demandList = document.createElement("div");
      setStyles(demandList, {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });

      for (const cityState of alliedCoverageNeeds.slice(0, 3)) {
        const tone =
          cityState.unmetCoverage >= 2.2
            ? highTone
            : cityState.unmetCoverage >= 1
              ? mediumTone
              : lowTone;
        const item = document.createElement("div");
        item.textContent =
          `${cityState.cityName}: unmet cover ${cityState.unmetCoverage.toFixed(1)} ` +
          `| threats ${cityState.activeThreatCount}`;
        setStyles(item, {
          padding: "8px",
          border: `1px solid ${tone.border}`,
          borderRadius: "7px",
          background: "rgba(255, 255, 255, 0.04)",
          color: tone.color,
          fontSize: "12px",
          fontWeight: "700",
          lineHeight: "1.35",
        });
        demandList.appendChild(item);
      }

      postureSection.content.appendChild(demandList);
    }

    if (directorSnapshot.recentLaunches.length === 0) {
      postureSection.content.appendChild(
        createEmptyState("Enemy bases are still holding inventory and probing for openings."),
      );
    } else {
      const launchList = document.createElement("div");
      setStyles(launchList, {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });

      for (const launch of directorSnapshot.recentLaunches.slice(0, 4)) {
        const item = document.createElement("div");
        item.textContent = launch;
        setStyles(item, {
          padding: "8px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "7px",
          background: "rgba(255, 255, 255, 0.04)",
          color: "#c7d5da",
          fontSize: "12px",
          lineHeight: "1.35",
        });
        launchList.appendChild(item);
      }

      postureSection.content.appendChild(launchList);
    }

    if (events.length === 0) {
      eventSection.content.appendChild(createEmptyState("No combat events yet."));
    } else {
      for (const event of events.slice(0, 12)) {
        eventSection.content.appendChild(createEventItem(event));
      }
    }
  };

  render(
    [],
    [],
    {
      stance: "balanced",
      summary: "Coverage and reserve posture are broadly balanced.",
      demandScore: 0,
      activeBurdenScore: 0,
      usefulAirborneScore: 0,
      reserveScore: 0,
      surplusScore: 0,
      sustainedSurplusSeconds: 0,
      sustainedDemandSeconds: 0,
      recallPressureActive: false,
      launchReleaseActive: false,
      recommendedActiveCount: 1,
      incursionCount: 0,
      cityStates: [],
    },
    {
      mode: "heuristic-fallback",
      objectiveScore: 0,
      consideredActionCount: 0,
      selectedActionCount: 0,
      primaryRationale: "No response plan has been generated yet.",
      beliefSummaries: [],
    },
    {
      aggressionTier: "opening",
      aggressionLabel: "Opening Probe",
      aggressionPercent: 26,
      activeEnemyCount: 0,
      activeEnemyCap: 0,
      postureSnapshot: {
        stance: "balanced",
        summary: "Launch appetite and active pressure are broadly matched.",
        demandScore: 0,
        activeBurdenScore: 0,
        usefulAirborneScore: 0,
        reserveScore: 0,
        surplusScore: 0,
        sustainedSurplusSeconds: 0,
        sustainedDemandSeconds: 0,
        recallPressureActive: false,
        launchReleaseActive: false,
        recommendedActiveCount: 1,
        opportunityCount: 0,
        cityStates: [],
      },
      cityExposureScores: [],
      recentLaunches: [],
    },
  );

  return {
    root: panel,
    update: render,
  };
}
