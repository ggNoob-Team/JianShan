import { describe, expect, it } from "vitest";

import { clampCropRect, cropDisplayRectToSource, type CropRect, type Size } from "./model";

const canvas: Size = { width: 300, height: 400 };
const image: Size = { width: 1200, height: 1600 };

describe("screenshot crop geometry", () => {
  it("clamps a crop rectangle to the canvas while preserving its minimum size", () => {
    const rect: CropRect = { x: -20, y: 380, width: 80, height: 80 };

    expect(clampCropRect(rect, canvas, 24)).toEqual({
      x: 0,
      y: 376,
      width: 80,
      height: 24,
    });
  });

  it("maps a displayed crop rectangle back to source pixels", () => {
    expect(
      cropDisplayRectToSource({ x: 75, y: 100, width: 150, height: 200 }, canvas, image),
    ).toEqual({ originX: 300, originY: 400, width: 600, height: 800 });
  });

  it("rejects an empty canvas when mapping crop geometry", () => {
    expect(() =>
      cropDisplayRectToSource({ x: 0, y: 0, width: 1, height: 1 }, { width: 0, height: 0 }, image),
    ).toThrow("Canvas size must be positive");
  });
});
