type OnboardingApi = {
  show: () => void;
  hide: () => void;
};

const seenOnboardingKey = "saab-sim-onboarding-seen";

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export function createOnboarding(container: HTMLElement): OnboardingApi {
  const overlay = document.createElement("div");
  setStyles(overlay, {
    position: "absolute",
    inset: "0",
    zIndex: "58",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.4)",
  });

  const card = document.createElement("div");
  setStyles(card, {
    width: "min(520px, calc(100vw - 28px))",
    padding: "14px",
    borderRadius: "8px",
    border: "1px solid rgba(180, 215, 235, 0.2)",
    background: "rgba(8, 20, 24, 0.96)",
    color: "#e5eef2",
    fontFamily: "Arial, sans-serif",
  });
  card.innerHTML = `
    <h3 style="margin:0 0 8px 0;">Quick Mission Guide</h3>
    <ol style="margin:0 0 8px 18px; padding:0; line-height:1.5; color:#c7d5da;">
      <li>Use <strong>Controls</strong> to start, pause, step, and set strategy.</li>
      <li>Track outcomes in <strong>Metrics</strong> and <strong>Explainability</strong>.</li>
      <li>Switch to <strong>Training</strong> mode to issue manual commands and compare against AI advice.</li>
      <li>Watch alerts for critical city-risk and posture transitions.</li>
    </ol>
  `;
  overlay.appendChild(card);

  const actionRow = document.createElement("div");
  setStyles(actionRow, {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "8px",
  });
  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.textContent = "Got it";
  setStyles(doneButton, {
    padding: "7px 11px",
    borderRadius: "6px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#e5eef2",
    cursor: "pointer",
  });
  actionRow.appendChild(doneButton);
  card.appendChild(actionRow);

  doneButton.addEventListener("click", () => {
    overlay.style.display = "none";
    localStorage.setItem(seenOnboardingKey, "1");
  });

  container.appendChild(overlay);

  return {
    show: () => {
      if (localStorage.getItem(seenOnboardingKey) === "1") {
        return;
      }
      overlay.style.display = "flex";
    },
    hide: () => {
      overlay.style.display = "none";
    },
  };
}
