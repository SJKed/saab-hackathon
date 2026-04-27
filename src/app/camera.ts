import type { MapBounds } from "../data/loader";
import { clamp } from "../ui/rendering/shared";

export type CameraState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type Point = {
  x: number;
  y: number;
};

const minZoom = 0.7;
const maxZoom = 3.5;
const cameraPadding = 24;

function getBoundsSize(bounds: MapBounds): { width: number; height: number } {
  return {
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function getClampedOffsets(
  zoom: number,
  canvas: HTMLCanvasElement,
  bounds: MapBounds,
): { minOffsetX: number; maxOffsetX: number; minOffsetY: number; maxOffsetY: number } {
  const { width, height } = getBoundsSize(bounds);
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;
  const centeredOffsetX = (canvas.width - scaledWidth) * 0.5 - bounds.minX * zoom;
  const centeredOffsetY = (canvas.height - scaledHeight) * 0.5 - bounds.minY * zoom;

  if (scaledWidth + cameraPadding * 2 <= canvas.width) {
    return {
      minOffsetX: centeredOffsetX,
      maxOffsetX: centeredOffsetX,
      minOffsetY:
        scaledHeight + cameraPadding * 2 <= canvas.height
          ? centeredOffsetY
          : canvas.height - cameraPadding - bounds.maxY * zoom,
      maxOffsetY:
        scaledHeight + cameraPadding * 2 <= canvas.height
          ? centeredOffsetY
          : cameraPadding - bounds.minY * zoom,
    };
  }

  if (scaledHeight + cameraPadding * 2 <= canvas.height) {
    return {
      minOffsetX: canvas.width - cameraPadding - bounds.maxX * zoom,
      maxOffsetX: cameraPadding - bounds.minX * zoom,
      minOffsetY: centeredOffsetY,
      maxOffsetY: centeredOffsetY,
    };
  }

  return {
    minOffsetX: canvas.width - cameraPadding - bounds.maxX * zoom,
    maxOffsetX: cameraPadding - bounds.minX * zoom,
    minOffsetY: canvas.height - cameraPadding - bounds.maxY * zoom,
    maxOffsetY: cameraPadding - bounds.minY * zoom,
  };
}

export function createFitCamera(
  canvas: HTMLCanvasElement,
  bounds: MapBounds,
): CameraState {
  const { width, height } = getBoundsSize(bounds);
  const fitZoom = clamp(
    Math.min(
      (canvas.width - cameraPadding * 2) / Math.max(1, width),
      (canvas.height - cameraPadding * 2) / Math.max(1, height),
    ),
    minZoom,
    maxZoom,
  );

  return clampCamera(
    {
      zoom: fitZoom,
      offsetX: 0,
      offsetY: 0,
    },
    canvas,
    bounds,
  );
}

export function clampCamera(
  camera: CameraState,
  canvas: HTMLCanvasElement,
  bounds: MapBounds,
): CameraState {
  const zoom = clamp(camera.zoom, minZoom, maxZoom);
  const offsets = getClampedOffsets(zoom, canvas, bounds);

  return {
    zoom,
    offsetX: clamp(camera.offsetX, offsets.minOffsetX, offsets.maxOffsetX),
    offsetY: clamp(camera.offsetY, offsets.minOffsetY, offsets.maxOffsetY),
  };
}

export function screenToWorld(camera: CameraState, point: Point): Point {
  return {
    x: (point.x - camera.offsetX) / camera.zoom,
    y: (point.y - camera.offsetY) / camera.zoom,
  };
}

export function worldToScreen(camera: CameraState, point: Point): Point {
  return {
    x: point.x * camera.zoom + camera.offsetX,
    y: point.y * camera.zoom + camera.offsetY,
  };
}

export function zoomCameraAtPoint(
  camera: CameraState,
  canvas: HTMLCanvasElement,
  bounds: MapBounds,
  screenPoint: Point,
  zoomFactor: number,
): CameraState {
  const worldPoint = screenToWorld(camera, screenPoint);
  const nextZoom = clamp(camera.zoom * zoomFactor, minZoom, maxZoom);

  return clampCamera(
    {
      zoom: nextZoom,
      offsetX: screenPoint.x - worldPoint.x * nextZoom,
      offsetY: screenPoint.y - worldPoint.y * nextZoom,
    },
    canvas,
    bounds,
  );
}

export function panCamera(
  camera: CameraState,
  canvas: HTMLCanvasElement,
  bounds: MapBounds,
  deltaX: number,
  deltaY: number,
): CameraState {
  return clampCamera(
    {
      ...camera,
      offsetX: camera.offsetX + deltaX,
      offsetY: camera.offsetY + deltaY,
    },
    canvas,
    bounds,
  );
}
