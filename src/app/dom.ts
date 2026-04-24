export type AppShell = {
  appElement: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

export function getAppShell(): AppShell {
  const canvasElement = document.getElementById("simulation-canvas");
  const appElement = document.getElementById("app");

  if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element with id 'simulation-canvas' not found.");
  }

  if (!(appElement instanceof HTMLDivElement)) {
    throw new Error("App container with id 'app' not found.");
  }

  const context = canvasElement.getContext("2d");
  if (!context) {
    throw new Error("2D rendering context could not be created.");
  }

  return {
    appElement,
    canvas: canvasElement,
    ctx: context,
  };
}
