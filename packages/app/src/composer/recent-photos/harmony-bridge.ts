interface HarmonyPhotoBridge {
  getRecentPhotos(callback: (resultJson: string) => void): void;
  getPhotoData(id: string, callback: (resultJson: string) => void): void;
}

export interface HarmonyRecentPhoto {
  assetId: string;
  previewUri: string;
  fileName: string;
  mimeType: string;
}

export interface HarmonyPhotoData {
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

const RECENT_PHOTOS_TIMEOUT_MS = 30_000;
const PHOTO_DATA_TIMEOUT_MS = 45_000;

function harmonyPhotoBridge(): HarmonyPhotoBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  const bridge = (window as unknown as { paseoPhotoLibrary?: Partial<HarmonyPhotoBridge> })
    .paseoPhotoLibrary;
  return typeof bridge?.getRecentPhotos === "function" && typeof bridge.getPhotoData === "function"
    ? (bridge as HarmonyPhotoBridge)
    : null;
}

export function hasHarmonyPhotoLibrary(): boolean {
  return harmonyPhotoBridge() !== null;
}

function requestBridgeValue<T>(
  start: (done: (value: T) => void) => void,
  timeoutMs: number,
): Promise<T | null> {
  const result = new Promise<T | null>((resolve) => {
    try {
      start((value) => resolve(value));
    } catch {
      resolve(null);
    }
  });
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([result, timeout]);
}

function parseRecentPhotos(resultJson: string | null): HarmonyRecentPhoto[] {
  if (!resultJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(resultJson) as {
      ok?: boolean;
      photos?: Array<{
        id?: unknown;
        previewUri?: unknown;
        fileName?: unknown;
        mimeType?: unknown;
      }>;
    };
    if (!parsed.ok || !Array.isArray(parsed.photos)) {
      return [];
    }
    return parsed.photos.flatMap((photo) => {
      if (
        typeof photo.id !== "string" ||
        typeof photo.previewUri !== "string" ||
        typeof photo.fileName !== "string" ||
        typeof photo.mimeType !== "string"
      ) {
        return [];
      }
      return [
        {
          assetId: photo.id,
          previewUri: photo.previewUri,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function requestRecentPhotosFromHarmony(): Promise<HarmonyRecentPhoto[]> {
  const bridge = harmonyPhotoBridge();
  if (!bridge) {
    return [];
  }
  const resultJson = await requestBridgeValue<string>(
    (done) => bridge.getRecentPhotos((value) => done(value)),
    RECENT_PHOTOS_TIMEOUT_MS,
  );
  return parseRecentPhotos(resultJson);
}

export async function requestPhotoDataFromHarmony(
  assetId: string,
): Promise<HarmonyPhotoData | null> {
  const bridge = harmonyPhotoBridge();
  if (!bridge) {
    return null;
  }
  const resultJson = await requestBridgeValue<string>(
    (done) => bridge.getPhotoData(assetId, (value) => done(value)),
    PHOTO_DATA_TIMEOUT_MS,
  );
  if (!resultJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(resultJson) as {
      ok?: boolean;
      dataUrl?: unknown;
      fileName?: unknown;
      mimeType?: unknown;
    };
    if (
      !parsed.ok ||
      typeof parsed.dataUrl !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.mimeType !== "string"
    ) {
      return null;
    }
    return {
      dataUrl: parsed.dataUrl,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
    };
  } catch {
    return null;
  }
}
