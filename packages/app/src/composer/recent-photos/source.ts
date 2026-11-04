import type { RecentPhoto } from "./model";
import { hasHarmonyPhotoLibrary, requestPhotoDataFromHarmony } from "./harmony-bridge";

export interface RecentPhotoSource {
  uri: string;
  fileName: string | null;
  mimeType: string;
}

export async function resolveRecentPhotoSource(
  photo: RecentPhoto,
): Promise<RecentPhotoSource | null> {
  if (!hasHarmonyPhotoLibrary()) {
    return null;
  }
  const data = await requestPhotoDataFromHarmony(photo.assetId);
  if (!data) {
    return null;
  }
  return {
    uri: data.dataUrl,
    fileName: data.fileName,
    mimeType: data.mimeType,
  };
}
