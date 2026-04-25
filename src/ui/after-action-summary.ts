import type { RunComparison } from "../engine/run-comparison";
import type { RunSummary } from "../engine/run-summary";

type AfterActionSummaryApi = {
  show: (summary: RunSummary, comparison: RunComparison | null) => void;
  hide: () => void;
  setOnRestart: (handler: () => void) => void;
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export function createAfterActionSummary(container: HTMLElement): AfterActionSummaryApi {
  const overlay = document.createElement("div");
  setStyles(overlay, {
    position: "absolute",
    inset: "0",
    zIndex: "65",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.5)",
  });

  const card = document.createElement("section");
  setStyles(card, {
    width: "min(640px, calc(100vw - 32px))",
    maxHeight: "min(84vh, 760px)",
    overflowY: "auto",
    borderRadius: "10px",
    border: "1px solid rgba(180, 215, 235, 0.22)",
    background: "rgba(8, 20, 24, 0.96)",
    color: "#e5eef2",
    fontFamily: "Arial, sans-serif",
    padding: "16px",
  });
  overlay.appendChild(card);
  container.appendChild(overlay);

  let onRestart: () => void = () => undefined;

  function render(summary: RunSummary, comparison: RunComparison | null): void {
    card.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = `After Action Report - ${summary.scenarioName}`;
    setStyles(title, { margin: "0 0 8px 0" });
    card.appendChild(title);

    const outcome = document.createElement("div");
    outcome.textContent = `${summary.outcome.toUpperCase()}: ${summary.reason}`;
    setStyles(outcome, {
      padding: "8px",
      borderRadius: "7px",
      border: "1px solid rgba(255, 255, 255, 0.15)",
      marginBottom: "10px",
    });
    card.appendChild(outcome);

    const kpis = document.createElement("div");
    kpis.textContent =
      `Cities protected ${summary.metrics.protectedCityCount}/${summary.metrics.totalCityCount} | ` +
      `Integrity ${Math.round(summary.metrics.cityIntegrityPercent)}% | ` +
      `Enemy neutralized ${summary.metrics.enemyNeutralizedCount}/${summary.metrics.totalEnemyCount} | ` +
      `Spend delta ${summary.metrics.spendDelta >= 0 ? "+" : ""}${summary.metrics.spendDelta.toFixed(1)} | ` +
      `Exchange ${summary.metrics.exchangeRatio.toFixed(2)}x`;
    setStyles(kpis, { fontSize: "12px", color: "#c7d5da", marginBottom: "8px" });
    card.appendChild(kpis);

    for (const highlight of summary.highlights) {
      const line = document.createElement("div");
      line.textContent = `- ${highlight}`;
      setStyles(line, { fontSize: "12px", lineHeight: "1.4", color: "#dfe9ec" });
      card.appendChild(line);
    }

    if (comparison) {
      const compare = document.createElement("div");
      compare.textContent =
        `Vs previous run: integrity ${comparison.cityIntegrityDelta >= 0 ? "+" : ""}${comparison.cityIntegrityDelta.toFixed(1)}%, ` +
        `neutralized ${comparison.neutralizedDelta >= 0 ? "+" : ""}${comparison.neutralizedDelta}, ` +
        `spend delta shift ${comparison.spendDeltaShift >= 0 ? "+" : ""}${comparison.spendDeltaShift.toFixed(1)}, ` +
        `exchange ${comparison.exchangeRatioDelta >= 0 ? "+" : ""}${comparison.exchangeRatioDelta.toFixed(2)}x.`;
      setStyles(compare, { marginTop: "10px", fontSize: "12px", color: "#9fb6be" });
      card.appendChild(compare);
    }

    const actions = document.createElement("div");
    setStyles(actions, {
      marginTop: "12px",
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px",
    });
    const restart = document.createElement("button");
    restart.type = "button";
    restart.textContent = "Restart Scenario";
    setStyles(restart, {
      padding: "8px 12px",
      borderRadius: "7px",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      background: "rgba(255, 255, 255, 0.08)",
      color: "#e5eef2",
      cursor: "pointer",
    });
    restart.addEventListener("click", () => onRestart());
    actions.appendChild(restart);
    card.appendChild(actions);
  }

  return {
    show: (summary, comparison) => {
      render(summary, comparison);
      overlay.style.display = "flex";
    },
    hide: () => {
      overlay.style.display = "none";
    },
    setOnRestart: (handler) => {
      onRestart = handler;
    },
  };
}
