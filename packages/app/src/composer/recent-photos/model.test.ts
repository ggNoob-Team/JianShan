import { describe, expect, it } from "vitest";
import { RECENT_PHOTO_LIMIT, selectRecentPhotos } from "./model";

function candidate(index: number, fileName = `IMG_${index}.jpg`) {
  return {
    assetId: `asset-${index}`,
    previewUri: `file:///photos/IMG_${index}.jpg`,
    fileName,
  };
}

describe("selectRecentPhotos", () => {
  it("keeps at most the five newest supported photos", () => {
    const photos = selectRecentPhotos(
      Array.from({ length: RECENT_PHOTO_LIMIT + 2 }, (_, index) => candidate(index)),
    );

    expect(photos.map((photo) => photo.assetId)).toEqual([
      "asset-0",
      "asset-1",
      "asset-2",
      "asset-3",
      "asset-4",
    ]);
  });

  it("drops assets that are not raster images", () => {
    const photos = selectRecentPhotos([
      candidate(0),
      candidate(1, "movie.mp4"),
      candidate(2, "document.pdf"),
      candidate(3, "IMG_3.HEIC"),
    ]);

    expect(photos.map((photo) => photo.assetId)).toEqual(["asset-0", "asset-3"]);
    expect(photos[1]?.mimeType).toBe("image/heic");
  });

  it("uses an explicit mime type when the filename has no extension", () => {
    const photos = selectRecentPhotos([
      {
        assetId: "asset-0",
        previewUri: "ph://asset-0",
        fileName: null,
        mimeType: "image/jpeg",
      },
    ]);

    expect(photos).toEqual([
      {
        assetId: "asset-0",
        previewUri: "ph://asset-0",
        fileName: null,
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("falls back to the preview URI when the filename has no extension", () => {
    const photos = selectRecentPhotos([
      {
        assetId: "asset-0",
        previewUri: "file:///photos/IMG_0.png",
        fileName: "IMG_0",
      },
    ]);

    expect(photos[0]?.mimeType).toBe("image/png");
  });
});
