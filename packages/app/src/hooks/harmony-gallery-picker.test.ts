/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { hasHarmonyGalleryPicker, pickImagesWithHarmonyGallery } from "./harmony-gallery-picker";

interface GalleryPhoto {
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

const PHOTO: GalleryPhoto = {
  dataUrl: "data:image/jpeg;base64,cGhvdG8=",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
};

afterEach(() => {
  delete (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker;
});

describe("Harmony gallery picker", () => {
  it("uses photos returned directly by pickImages without requiring readImages", async () => {
    const pickImages = vi.fn((callback: (resultJson: string) => void) => {
      callback(JSON.stringify({ ok: true, uris: ["file://photo.jpg"], photos: [PHOTO] }));
    });
    (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker = { pickImages };

    expect(hasHarmonyGalleryPicker()).toBe(true);
    await expect(pickImagesWithHarmonyGallery()).resolves.toEqual([
      {
        source: { kind: "data_url", dataUrl: PHOTO.dataUrl },
        fileName: PHOTO.fileName,
        mimeType: PHOTO.mimeType,
      },
    ]);
  });

  it("keeps the two-step bridge working for previously built Harmony shells", async () => {
    const pickImages = vi.fn((callback: (resultJson: string) => void) => {
      callback(JSON.stringify({ ok: true, uris: ["file://photo.jpg"] }));
    });
    const readImages = vi.fn((_urisJson: string, callback: (resultJson: string) => void) => {
      callback(JSON.stringify({ ok: true, photos: [PHOTO] }));
    });
    (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker = {
      pickImages,
      readImages,
    };

    await expect(pickImagesWithHarmonyGallery()).resolves.toHaveLength(1);
    expect(readImages).toHaveBeenCalledWith(
      JSON.stringify(["file://photo.jpg"]),
      expect.any(Function),
    );
  });

  it("returns null when the Harmony picker bridge is absent", async () => {
    expect(hasHarmonyGalleryPicker()).toBe(false);
    await expect(pickImagesWithHarmonyGallery()).resolves.toBeNull();
  });
});
