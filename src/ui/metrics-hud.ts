import type { MetricsSnapshot } from "../engine/metrics";

type HudApi = {
  update: (metrics: MetricsSnapshot) => void;
};

type HudTone = {
  color: string;
  background: string;
  border: string;
};

type MetricCard = {
  root: HTMLDivElement;
  value: HTMLDivElement;
  detail: HTMLDivElement;
};

const goodTone: HudTone = {
  color: "#74d680",
  background: "rgba(116, 214, 128, 0.12)",
  border: "rgba(116, 214, 128, 0.32)",
};

const warningTone: HudTone = {
  color: "#ffd166",
  background: "rgba(255, 209, 102, 0.13)",
  border: "rgba(255, 209, 102, 0.34)",
};

const dangerTone: HudTone = {
  color: "#ff6b6b",
  background: "rgba(255, 107, 107, 0.14)",
  border: "rgba(255, 107, 107, 0.34)",
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatSpend(value: number): string {
  return `$${Math.round(value)}`;
}

function getPercentTone(value: number): HudTone {
  if (value >= 80) {
    return goodTone;
  }

  if (value >= 50) {
    return warningTone;
  }

  return dangerTone;
}

function getNeutralizedTone(metrics: MetricsSnapshot): HudTone {
  if (metrics.totalEnemyCount === 0) {
    return warningTone;
  }

  const neutralizedPercent =
    (metrics.enemyNeutralizedCount / metrics.totalEnemyCount) * 100;

  if (neutralizedPercent >= 70) {
    return goodTone;
  }

  if (neutralizedPercent > 0 || metrics.activeInterceptCount > 0) {
    return warningTone;
  }

  return dangerTone;
}

function getEfficiencyTone(metrics: MetricsSnapshot): HudTone {
  if (metrics.enemyNeutralizedCount > 0 && metrics.resourceLossCount === 0) {
    return goodTone;
  }

  if (metrics.enemyNeutralizedCount >= metrics.resourceLossCount) {
    return warningTone;
  }

  return dangerTone;
}

function getResponseTone(responseTicks: number | null): HudTone {
  if (responseTicks === null) {
    return warningTone;
  }

  if (responseTicks <= 4) {
    return goodTone;
  }

  if (responseTicks <= 8) {
    return warningTone;
  }

  return dangerTone;
}

function getSamTone(percent: number): HudTone {
  if (percent >= 60) {
    return goodTone;
  }
  if (percent >= 30) {
    return warningTone;
  }
  return dangerTone;
}

function getSpendTone(spend: number): HudTone {
  if (spend <= 150) {
    return goodTone;
  }
  if (spend <= 350) {
    return warningTone;
  }
  return dangerTone;
}

function getSpendDeltaTone(delta: number): HudTone {
  if (delta <= -25) {
    return goodTone;
  }
  if (delta <= 40) {
    return warningTone;
  }
  return dangerTone;
}

function getExchangeTone(ratio: number): HudTone {
  if (ratio >= 1.3) {
    return goodTone;
  }
  if (ratio >= 0.9) {
    return warningTone;
  }
  return dangerTone;
}

function getRateTone(rate: number): HudTone {
  if (rate <= 8) {
    return goodTone;
  }
  if (rate <= 20) {
    return warningTone;
  }
  return dangerTone;
}

function applyTone(card: MetricCard, tone: HudTone): void {
  card.root.style.borderColor = "transparent";
  card.root.style.borderLeftColor = tone.color;
  card.root.style.background = "transparent";
  card.value.style.color = tone.color;
}

function createMetricCard(label: string): MetricCard {
  const root = document.createElement("div");
  setStyles(root, {
    display: "flex",
    alignItems: "center",
    flexShrink: "0",
    gap: "7px",
    minWidth: "max-content",
    height: "100%",
    padding: "0 13px",
    border: "0 solid transparent",
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderRadius: "0",
    background: "transparent",
  });

  const labelElement = document.createElement("div");
  labelElement.textContent = label;
  setStyles(labelElement, {
    color: "#9fb6be",
    fontSize: "10px",
    fontWeight: "800",
    letterSpacing: "0",
    lineHeight: "1",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  });
  root.appendChild(labelElement);

  const value = document.createElement("div");
  setStyles(value, {
    color: "#f5f5f5",
    fontSize: "14px",
    fontWeight: "900",
    lineHeight: "1",
    whiteSpace: "nowrap",
  });
  root.appendChild(value);

  const detail = document.createElement("div");
  setStyles(detail, {
    color: "#8fa8b1",
    fontSize: "10px",
    lineHeight: "1",
    whiteSpace: "nowrap",
  });
  root.appendChild(detail);

  return {
    root,
    value,
    detail,
  };
}

export function createMetricsHud(container: HTMLElement): HudApi {
  const hud = document.createElement("aside");
  setStyles(hud, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "30",
    boxSizing: "border-box",
    width: "100vw",
    height: "34px",
    padding: "0 10px",
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: "0",
    overflow: "hidden",
    borderBottom: "1px solid rgba(180, 215, 235, 0.18)",
    background: "#071417",
    color: "#e5eef2",
    fontFamily: "Arial, sans-serif",
  });

  const title = document.createElement("div");
  title.textContent = "Metrics";
  setStyles(title, {
    flexShrink: "0",
    padding: "0 12px 0 2px",
    borderRight: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#f5f5f5",
    fontSize: "11px",
    fontWeight: "900",
    lineHeight: "1",
    textTransform: "uppercase",
  });
  hud.appendChild(title);

  const grid = document.createElement("div");
  setStyles(grid, {
    display: "flex",
    alignItems: "stretch",
    flex: "1 1 auto",
    height: "100%",
    minWidth: "0",
    overflowX: "auto",
    overflowY: "hidden",
  });
  hud.appendChild(grid);

  const cityProtection = createMetricCard("Cities Protected");
  const cityIntegrity = createMetricCard("City Integrity");
  const enemyNeutralized = createMetricCard("Enemy Neutralized");
  const resourceEfficiency = createMetricCard("Efficiency");
  const responseTime = createMetricCard("Avg Response");
  const citySam = createMetricCard("City SAM");
  const enemySam = createMetricCard("Enemy Base SAM");
  const alliedSpend = createMetricCard("Allied Spend");
  const enemySpend = createMetricCard("Enemy Spend");
  const spendDelta = createMetricCard("Spend Delta");
  const exchangeRatio = createMetricCard("Exchange");
  const spendRate = createMetricCard("Spend Rate");
  const cards = [
    cityProtection,
    cityIntegrity,
    enemyNeutralized,
    resourceEfficiency,
    responseTime,
    citySam,
    enemySam,
    alliedSpend,
    enemySpend,
    spendDelta,
    exchangeRatio,
    spendRate,
  ];

  for (const card of cards) {
    grid.appendChild(card.root);
  }

  container.style.position = "relative";
  container.appendChild(hud);

  function update(metrics: MetricsSnapshot): void {
    cityProtection.value.textContent = formatPercent(metrics.citiesProtectedPercent);
    cityProtection.detail.textContent = `${metrics.protectedCityCount}/${metrics.totalCityCount} cities live`;
    applyTone(cityProtection, getPercentTone(metrics.citiesProtectedPercent));

    cityIntegrity.value.textContent = formatPercent(metrics.cityIntegrityPercent);
    cityIntegrity.detail.textContent = "remaining city health";
    applyTone(cityIntegrity, getPercentTone(metrics.cityIntegrityPercent));

    enemyNeutralized.value.textContent = `${metrics.enemyNeutralizedCount}/${metrics.totalEnemyCount}`;
    enemyNeutralized.detail.textContent = `${metrics.activeInterceptCount} active intercepts`;
    applyTone(enemyNeutralized, getNeutralizedTone(metrics));

    resourceEfficiency.value.textContent = metrics.resourceEfficiencyLabel;
    resourceEfficiency.detail.textContent = `${metrics.resourceLossCount}/${metrics.totalResourceCount} resources lost`;
    applyTone(resourceEfficiency, getEfficiencyTone(metrics));

    responseTime.value.textContent =
      metrics.averageResponseTicks === null
        ? "--"
        : `${metrics.averageResponseTicks.toFixed(1)}t`;
    responseTime.detail.textContent = `${metrics.activeReinforcementCount} reinforcements`;
    applyTone(responseTime, getResponseTone(metrics.averageResponseTicks));

    citySam.value.textContent = formatPercent(metrics.citySamRemainingPercent);
    citySam.detail.textContent = `${metrics.citySamRemainingCount} missiles remaining`;
    applyTone(citySam, getSamTone(metrics.citySamRemainingPercent));

    enemySam.value.textContent = formatPercent(metrics.enemyBaseSamRemainingPercent);
    enemySam.detail.textContent = `${metrics.enemyBaseSamRemainingCount} missiles remaining`;
    applyTone(enemySam, getSamTone(metrics.enemyBaseSamRemainingPercent));

    alliedSpend.value.textContent = formatSpend(metrics.alliedSpendTotal);
    alliedSpend.detail.textContent = `M ${Math.round(metrics.alliedSpendMunitions)} | A ${Math.round(metrics.alliedSpendAttrition)} | I ${Math.round(metrics.alliedSpendInfrastructure)}`;
    applyTone(alliedSpend, getSpendTone(metrics.alliedSpendTotal));

    enemySpend.value.textContent = formatSpend(metrics.enemySpendTotal);
    enemySpend.detail.textContent = `M ${Math.round(metrics.enemySpendMunitions)} | A ${Math.round(metrics.enemySpendAttrition)} | I ${Math.round(metrics.enemySpendInfrastructure)}`;
    applyTone(enemySpend, getSpendTone(metrics.enemySpendTotal));

    spendDelta.value.textContent = `${metrics.spendDelta >= 0 ? "+" : ""}${Math.round(metrics.spendDelta)}`;
    spendDelta.detail.textContent = "allied minus enemy";
    applyTone(spendDelta, getSpendDeltaTone(metrics.spendDelta));

    exchangeRatio.value.textContent = `${metrics.exchangeRatio.toFixed(2)}x`;
    exchangeRatio.detail.textContent = "enemy spend per allied spend";
    applyTone(exchangeRatio, getExchangeTone(metrics.exchangeRatio));

    spendRate.value.textContent = `${metrics.alliedSpendRatePerTick.toFixed(1)} / ${metrics.enemySpendRatePerTick.toFixed(1)}`;
    spendRate.detail.textContent = "allied/enemy spend per tick";
    applyTone(
      spendRate,
      getRateTone(
        (metrics.alliedSpendRatePerTick + metrics.enemySpendRatePerTick) / 2,
      ),
    );
  }

  return { update };
}
