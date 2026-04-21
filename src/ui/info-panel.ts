import type { ResourceAssignment } from "../engine/allocation";

type InfoPanelApi = {
  update: (assignments: ResourceAssignment[]) => void;
};

export function createInfoPanel(container: HTMLElement): InfoPanelApi {
  const panel = document.createElement("aside");
  panel.style.position = "absolute";
  panel.style.right = "16px";
  panel.style.bottom = "16px";
  panel.style.width = "380px";
  panel.style.maxHeight = "45vh";
  panel.style.overflowY = "auto";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = "10px";
  panel.style.padding = "12px";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.15)";
  panel.style.borderRadius = "8px";
  panel.style.background = "rgba(8, 20, 24, 0.92)";
  panel.style.fontFamily = "Arial, sans-serif";

  const title = document.createElement("strong");
  title.textContent = "Explainability Panel";
  title.style.color = "#f5f5f5";
  title.style.fontSize = "14px";
  title.style.cursor = "move";
  title.style.userSelect = "none";
  panel.appendChild(title);

  const content = document.createElement("div");
  content.style.display = "flex";
  content.style.flexDirection = "column";
  content.style.gap = "8px";
  panel.appendChild(content);

  container.appendChild(panel);

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  title.addEventListener("pointerdown", (event) => {
    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    panel.style.left = `${panelRect.left - containerRect.left}px`;
    panel.style.top = `${panelRect.top - containerRect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    dragOffsetX = event.clientX - panelRect.left;
    dragOffsetY = event.clientY - panelRect.top;
    isDragging = true;
    title.setPointerCapture(event.pointerId);
  });

  title.addEventListener("pointermove", (event) => {
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

  title.addEventListener("pointerup", (event) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    title.releasePointerCapture(event.pointerId);
  });

  title.addEventListener("pointercancel", (event) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    title.releasePointerCapture(event.pointerId);
  });

  const render = (assignments: ResourceAssignment[]): void => {
    content.innerHTML = "";

    if (assignments.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No active assignments.";
      empty.style.color = "#b8c7cc";
      empty.style.fontSize = "12px";
      content.appendChild(empty);
      return;
    }

    for (const assignment of assignments) {
      const item = document.createElement("div");
      item.style.padding = "8px";
      item.style.border = "1px solid rgba(255, 255, 255, 0.12)";
      item.style.borderRadius = "6px";
      item.style.background = "rgba(16, 36, 42, 0.7)";

      const header = document.createElement("div");
      const missionLabel =
        assignment.mission === "intercept" ? "Intercept" : "Reinforce";
      header.textContent = `${missionLabel}: ${assignment.resourceName} -> ${assignment.targetName}`;
      header.style.color = "#f5f5f5";
      header.style.fontSize = "12px";
      header.style.fontWeight = "bold";
      item.appendChild(header);

      const reason = document.createElement("div");
      reason.textContent = `Why assigned: ${assignment.reason}`;
      reason.style.color = "#d8e1e5";
      reason.style.fontSize = "12px";
      reason.style.marginTop = "4px";
      item.appendChild(reason);

      const threat = document.createElement("div");
      threat.textContent = `Threat score: ${assignment.threatScore.toFixed(4)}`;
      threat.style.color = "#ff9b9b";
      threat.style.fontSize = "12px";
      threat.style.marginTop = "4px";
      item.appendChild(threat);

      const priority = document.createElement("div");
      priority.textContent = `Priority score: ${assignment.priorityScore.toFixed(4)}`;
      priority.style.color = "#ffd166";
      priority.style.fontSize = "12px";
      priority.style.marginTop = "2px";
      item.appendChild(priority);

      content.appendChild(item);
    }
  };

  render([]);

  return {
    update: render,
  };
}
