import { getFileExtension, resolveRasterImageMimeType } from "@/attachments/file-types";

export const RECENT_PHOTO_LIMIT = 5;

export interface RecentPhoto {
  assetId: string;
  previewUri: string;
  fileName: string | null;
  mimeType: string;
}

export interface RecentPhotoCandidate {
  assetId: string;
  previewUri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export function toRecentPhoto(candidate: RecentPhotoCandidate): RecentPhoto | null {
  const fileName = candidate.fileName?.trim() || null;
  const fileNameHasExtension = fileName ? getFileExtension(fileName).length > 0 : false;
  const mimeType =
    resolveRasterImageMimeType({
      mimeType: candidate.mimeType,
      path: fileName ?? candidate.previewUri,
    }) ??
    (fileNameHasExtension ? null : resolveRasterImageMimeType({ path: candidate.previewUri }));
  if (!mimeType) {
    return null;
  }

  return {
    assetId: candidate.assetId,
    previewUri: candidate.previewUri,
    fileName,
    mimeType,
  };
}

export function selectRecentPhotos(
  candidates: readonly RecentPhotoCandidate[],
  limit = RECENT_PHOTO_LIMIT,
): RecentPhoto[] {
  return candidates
    .map(toRecentPhoto)
    .filter((photo): photo is RecentPhoto => photo !== null)
    .slice(0, limit);
}
