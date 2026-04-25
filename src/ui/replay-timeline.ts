import type { ReplayStore } from "../engine/replay-store";

type ReplayTimelineApi = {
  root: HTMLElement;
  update: (replay: ReplayStore, tick: number) => void;
  getSelectedTick: () => number | null;
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export function createReplayTimeline(container: HTMLElement): ReplayTimelineApi {
  const panel = document.createElement("aside");
  setStyles(panel, {
    position: "absolute",
    left: "16px",
    bottom: "16px",
    width: "min(500px, calc(100vw - 32px))",
    zIndex: "22",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid rgba(180, 215, 235, 0.16)",
    background: "rgba(8, 20, 24, 0.9)",
    color: "#e5eef2",
    fontFamily: "Arial, sans-serif",
  });

  const title = document.createElement("strong");
  title.textContent = "Replay Timeline";
  panel.appendChild(title);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "0";
  slider.value = "0";
  setStyles(slider, { width: "100%" });
  panel.appendChild(slider);

  const caption = document.createElement("div");
  setStyles(caption, { fontSize: "11px", color: "#9fb6be" });
  panel.appendChild(caption);

  container.appendChild(panel);

  let selectedTick: number | null = null;
  slider.addEventListener("input", () => {
    selectedTick = Number(slider.value);
  });

  return {
    root: panel,
    getSelectedTick: () => selectedTick,
    update: (replay, tick) => {
      const latestFrame = replay.frames[replay.frames.length - 1];
      const latestTick = latestFrame?.tick ?? tick;
      slider.max = String(Math.max(0, latestTick));
      if (selectedTick === null) {
        slider.value = slider.max;
      }
      caption.textContent = `Frames: ${replay.frames.length} | Events: ${replay.events.length} | Tick ${slider.value}`;
    },
  };
}
