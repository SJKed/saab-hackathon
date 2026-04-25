export type AlertLevel = "info" | "warning" | "critical";

export type AlertItem = {
  id: string;
  message: string;
  level: AlertLevel;
};

type AlertsApi = {
  push: (level: AlertLevel, message: string) => void;
  clear: () => void;
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function getLevelColor(level: AlertLevel): string {
  if (level === "critical") {
    return "#ff6b6b";
  }
  if (level === "warning") {
    return "#ffd166";
  }
  return "#74d680";
}

export function createAlerts(container: HTMLElement): AlertsApi {
  const root = document.createElement("aside");
  setStyles(root, {
    position: "absolute",
    top: "52px",
    right: "16px",
    zIndex: "55",
    width: "min(360px, calc(100vw - 32px))",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    pointerEvents: "none",
  });
  container.appendChild(root);

  let alerts: AlertItem[] = [];

  function render(): void {
    root.replaceChildren();
    for (const alert of alerts) {
      const item = document.createElement("div");
      setStyles(item, {
        padding: "8px 10px",
        borderRadius: "7px",
        border: `1px solid ${getLevelColor(alert.level)}55`,
        background: "rgba(8, 20, 24, 0.9)",
        color: "#e5eef2",
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        lineHeight: "1.35",
      });
      item.textContent = alert.message;
      root.appendChild(item);
    }
  }

  return {
    push: (level, message) => {
      const id = `${level}:${message}`;
      if (alerts.some((alert) => alert.id === id)) {
        return;
      }
      alerts = [{ id, level, message }, ...alerts].slice(0, 5);
      render();
    },
    clear: () => {
      alerts = [];
      render();
    },
  };
}
