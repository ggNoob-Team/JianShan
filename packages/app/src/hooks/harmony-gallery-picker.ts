import type { PickedImageAttachmentInput } from "@/hooks/image-attachment-picker";

interface HarmonyGalleryBridge {
  pickImages(callback: (resultJson: string) => void): void;
  readImages?: (urisJson: string, callback: (resultJson: string) => void) => void;
}

interface GalleryPickResponse {
  ok?: boolean;
  uris?: unknown;
  photos?: GalleryPhoto[];
}

interface GalleryPhoto {
  dataUrl?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
}

interface GalleryReadResponse {
  ok?: boolean;
  photos?: GalleryPhoto[];
}

const PICK_TIMEOUT_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 60_000;

function harmonyGalleryBridge(): HarmonyGalleryBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  const bridge = (window as unknown as { paseoPhotoPicker?: Partial<HarmonyGalleryBridge> })
    .paseoPhotoPicker;
  return typeof bridge?.pickImages === "function" ? (bridge as HarmonyGalleryBridge) : null;
}

export function hasHarmonyGalleryPicker(): boolean {
  return harmonyGalleryBridge() !== null;
}

function requestBridgeValue<T>(
  start: (done: (value: T) => void) => void,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      // oxlint-disable-next-line eslint-plugin-promise/no-multiple-resolved -- guarded by settled.
      resolve(value);
    };
    try {
      start(finish);
    } catch {
      finish(null);
    }
    timeout = setTimeout(() => finish(null), timeoutMs);
  });
}

function parseUris(resultJson: string | null): string[] {
  if (!resultJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(resultJson) as GalleryPickResponse;
    if (!parsed.ok || !Array.isArray(parsed.uris)) {
      return [];
    }
    return parsed.uris.filter((uri): uri is string => typeof uri === "string");
  } catch {
    return [];
  }
}

function parsePhotos(resultJson: string | null): PickedImageAttachmentInput[] {
  if (!resultJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(resultJson) as GalleryReadResponse;
    if (!parsed.ok || !Array.isArray(parsed.photos)) {
      return [];
    }
    return parsed.photos.flatMap((photo) => {
      if (
        typeof photo.dataUrl !== "string" ||
        typeof photo.fileName !== "string" ||
        typeof photo.mimeType !== "string"
      ) {
        return [];
      }
      return [
        {
          source: { kind: "data_url" as const, dataUrl: photo.dataUrl },
          fileName: photo.fileName,
          mimeType: photo.mimeType,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Opens the HarmonyOS photo picker directly. Current shells return the
 * downscaled photos from pickImages itself; older shells return URIs and still
 * use the readImages follow-up.
 */
export async function pickImagesWithHarmonyGallery(): Promise<PickedImageAttachmentInput[] | null> {
  const bridge = harmonyGalleryBridge();
  if (!bridge) {
    return null;
  }

  const pickJson = await requestBridgeValue<string>(
    (done) => bridge.pickImages((value) => done(value)),
    PICK_TIMEOUT_MS,
  );
  const pickedPhotos = parsePhotos(pickJson);
  if (pickedPhotos.length > 0) {
    return pickedPhotos;
  }

  const uris = parseUris(pickJson);
  if (uris.length === 0) {
    return null;
  }
  const readImages = bridge.readImages;
  if (typeof readImages !== "function") {
    return null;
  }

  const readJson = await requestBridgeValue<string>(
    (done) => readImages(JSON.stringify(uris), (value) => done(value)),
    READ_TIMEOUT_MS,
  );
  const photos = parsePhotos(readJson);
  return photos.length > 0 ? photos : null;
}
