import type { RecentPhoto } from "./model";

export interface RecentPhotoSource {
  uri: string;
  fileName: string | null;
  mimeType: string;
}

/** Native platforms replace this module with `source.native.ts`. */
export async function resolveRecentPhotoSource(
  _photo: RecentPhoto,
): Promise<RecentPhotoSource | null> {
  return null;
}
