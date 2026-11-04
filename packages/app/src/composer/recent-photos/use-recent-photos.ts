import type { RecentPhoto } from "./model";

const EMPTY_PHOTOS: RecentPhoto[] = [];

export interface UseRecentPhotosResult {
  photos: RecentPhoto[];
  isLoading: boolean;
  hasLoaded: boolean;
}

/**
 * Web and the HarmonyOS shell have no supported media-library enumeration.
 * Android/iOS replace this module with `use-recent-photos.native.ts`; Harmony
 * keeps the system picker behind "Add image".
 */
export function useRecentPhotos(_input: { enabled: boolean }): UseRecentPhotosResult {
  return { photos: EMPTY_PHOTOS, isLoading: false, hasLoaded: true };
}
