type ModalRibbonApi = {
  workspace: HTMLDivElement;
  registerPanel: (input: {
    id: string;
    label: string;
    panel: HTMLElement;
    defaultVisible?: boolean;
  }) => void;
};

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export function createModalRibbon(container: HTMLElement): ModalRibbonApi {
  const dock = document.createElement("aside");
  setStyles(dock, {
    position: "absolute",
    top: "40px",
    left: "0",
    bottom: "0",
    width: "min(560px, calc(100vw - 24px))",
    display: "flex",
    alignItems: "stretch",
    zIndex: "25",
    pointerEvents: "none",
  });

  const ribbon = document.createElement("div");
  setStyles(ribbon, {
    width: "72px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "12px 8px",
    borderRight: "1px solid rgba(180, 215, 235, 0.16)",
    background: "rgba(7, 20, 23, 0.92)",
    backdropFilter: "blur(6px)",
    pointerEvents: "auto",
  });
  dock.appendChild(ribbon);

  const workspace = document.createElement("div");
  setStyles(workspace, {
    position: "relative",
    flex: "1",
    minWidth: "0",
    pointerEvents: "auto",
  });
  dock.appendChild(workspace);

  container.appendChild(dock);

  let highestZIndex = 10;

  const panelState = new Map<
    string,
    {
      panel: HTMLElement;
      button: HTMLButtonElement;
      display: string;
      lastHeight: number;
      lastWidth: number;
      visible: boolean;
    }
  >();

  function snapPanel(panel: HTMLElement): void {
    panel.style.left = "16px";
    panel.style.right = "auto";
  }

  function focusPanel(id: string): void {
    const state = panelState.get(id);
    if (!state) {
      return;
    }

    highestZIndex += 1;
    state.panel.style.zIndex = String(highestZIndex);

    for (const [entryId, entry] of panelState.entries()) {
      entry.button.style.background =
        entryId === id && entry.visible
          ? "rgba(116, 214, 128, 0.16)"
          : "rgba(255, 255, 255, 0.05)";
      entry.button.style.borderColor =
        entryId === id && entry.visible
          ? "rgba(116, 214, 128, 0.35)"
          : "rgba(255, 255, 255, 0.12)";
      entry.button.style.color = entry.visible ? "#f5f5f5" : "#9fb6be";
    }
  }

  function setVisible(id: string, nextVisible: boolean): void {
    const state = panelState.get(id);
    if (!state) {
      return;
    }

    state.visible = nextVisible;
    state.panel.style.display = nextVisible ? state.display : "none";
    if (nextVisible) {
      if (state.panel.dataset.modalDetached !== "true") {
        snapPanel(state.panel);
      }
      state.lastWidth = state.panel.offsetWidth;
      state.lastHeight = state.panel.offsetHeight;
      focusPanel(id);
    } else {
      state.button.style.background = "rgba(255, 255, 255, 0.05)";
      state.button.style.borderColor = "rgba(255, 255, 255, 0.12)";
      state.button.style.color = "#9fb6be";
    }
  }

  return {
    workspace,
    registerPanel: ({ id, label, panel, defaultVisible = true }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      setStyles(button, {
        padding: "10px 8px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "8px",
        background: "rgba(255, 255, 255, 0.05)",
        color: "#9fb6be",
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: "700",
        textAlign: "center",
      });
      ribbon.appendChild(button);

      const display = panel.style.display || "flex";
      panelState.set(id, {
        panel,
        button,
        display,
        lastHeight: panel.offsetHeight,
        lastWidth: panel.offsetWidth,
        visible: defaultVisible,
      });
      panel.dataset.modalDetached = "false";

      panel.addEventListener("pointerdown", () => {
        if (panelState.get(id)?.visible) {
          focusPanel(id);
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        const state = panelState.get(id);
        if (!state || !state.visible) {
          return;
        }

        const widthChanged = Math.abs(state.lastWidth - panel.offsetWidth) > 1;
        const heightChanged = Math.abs(state.lastHeight - panel.offsetHeight) > 1;
        if (widthChanged || heightChanged) {
          panel.dataset.modalDetached = "true";
          state.lastWidth = panel.offsetWidth;
          state.lastHeight = panel.offsetHeight;
        }
      });
      resizeObserver.observe(panel);

      button.addEventListener("click", () => {
        const visible = panelState.get(id)?.visible ?? false;
        setVisible(id, !visible);
      });

      setVisible(id, defaultVisible);
    },
  };
}
