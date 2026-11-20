export interface Size {
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceCropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps a crop rectangle inside its display canvas. The rectangle shrinks at
 * an edge instead of being moved away from that edge, so dragging a handle past
 * the canvas still leaves a usable minimum selection.
 */
export function clampCropRect(rect: CropRect, canvas: Size, minimumSize = 1): CropRect {
  const minSize = Math.max(1, Math.min(minimumSize, canvas.width, canvas.height));
  const x = clamp(rect.x, 0, Math.max(0, canvas.width - minSize));
  const y = clamp(rect.y, 0, Math.max(0, canvas.height - minSize));
  const width = Math.max(minSize, Math.min(rect.width, canvas.width - x));
  const height = Math.max(minSize, Math.min(rect.height, canvas.height - y));
  return { x, y, width, height };
}

/** Converts a crop rectangle from the editor's fitted canvas to source pixels. */
export function cropDisplayRectToSource(rect: CropRect, canvas: Size, image: Size): SourceCropRect {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error("Canvas size must be positive");
  }
  const xScale = image.width / canvas.width;
  const yScale = image.height / canvas.height;
  return {
    originX: Math.round(rect.x * xScale),
    originY: Math.round(rect.y * yScale),
    width: Math.max(1, Math.round(rect.width * xScale)),
    height: Math.max(1, Math.round(rect.height * yScale)),
  };
}
