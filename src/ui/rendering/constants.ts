export const cityColor = "#ffd166";
export const alliedSpawnZoneColor = "#4cc9f0";
export const enemyColor = "#ff6b6b";
export const enemyBaseColor = "#d1495b";
export const alliedPlatformColor = "#73d2ff";
export const labelColor = "#e0e0e0";
export const assignmentColor = "rgba(76, 201, 240, 0.7)";
export const interceptAssignmentColor = "rgba(255, 183, 3, 0.78)";
export const alliedDeploymentLineColor = "rgba(76, 201, 240, 0.36)";
export const enemyDeploymentLineColor = "rgba(255, 107, 107, 0.45)";
export const hoverPointRadius = 18;
export const alliedEffectColor = "#73d2ff";
export const enemyEffectColor = "#ff7a45";
export const neutralEffectColor = "#ffd9a0";

function createIcon(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

export const airplaneIcon = createIcon(
  new URL("../../../assets/airplane.png", import.meta.url).href,
);
export const droneIcon = createIcon(
  new URL("../../../assets/drone.png", import.meta.url).href,
);
