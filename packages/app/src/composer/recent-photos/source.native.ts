import * as MediaLibrary from "expo-media-library";
import type { RecentPhoto } from "./model";

export interface RecentPhotoSource {
  uri: string;
  fileName: string | null;
  mimeType: string;
}

export async function resolveRecentPhotoSource(
  photo: RecentPhoto,
): Promise<RecentPhotoSource | null> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(photo.assetId);
    const uri = info.localUri ?? info.uri;
    if (!uri) {
      return null;
    }
    return {
      uri,
      fileName: info.filename ?? photo.fileName,
      mimeType: photo.mimeType,
    };
  } catch (error) {
    console.warn("[RecentPhotos] Failed to resolve photo source", error);
    return null;
  }
}
