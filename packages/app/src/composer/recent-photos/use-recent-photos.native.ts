import { useCallback, useEffect, useRef, useState } from "react";
import * as MediaLibrary from "expo-media-library";
import {
  RECENT_PHOTO_LIMIT,
  selectRecentPhotos,
  type RecentPhoto,
  type RecentPhotoCandidate,
} from "./model";

const EMPTY_PHOTOS: RecentPhoto[] = [];
const PHOTO_PERMISSIONS: MediaLibrary.GranularPermission[] = ["photo"];
let hasRequestedPhotoPermission = false;

export interface UseRecentPhotosResult {
  photos: RecentPhoto[];
  isLoading: boolean;
  hasLoaded: boolean;
}

async function loadRecentPhotos(allowPermissionPrompt: boolean): Promise<RecentPhoto[]> {
  if (!(await MediaLibrary.isAvailableAsync())) {
    return EMPTY_PHOTOS;
  }

  let permission = await MediaLibrary.getPermissionsAsync(false, PHOTO_PERMISSIONS);
  if (!permission.granted && permission.canAskAgain && allowPermissionPrompt) {
    hasRequestedPhotoPermission = true;
    permission = await MediaLibrary.requestPermissionsAsync(false, PHOTO_PERMISSIONS);
  }
  if (!permission.granted) {
    return EMPTY_PHOTOS;
  }

  const { assets } = await MediaLibrary.getAssetsAsync({
    first: RECENT_PHOTO_LIMIT,
    mediaType: "photo",
    sortBy: [["creationTime", false]],
  });
  const candidates: RecentPhotoCandidate[] = assets.map((asset) => ({
    assetId: asset.id,
    previewUri: asset.uri,
    fileName: asset.filename,
  }));
  return selectRecentPhotos(candidates);
}

export function useRecentPhotos(input: { enabled: boolean }): UseRecentPhotosResult {
  const [photos, setPhotos] = useState<RecentPhoto[]>(EMPTY_PHOTOS);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestSequence = useRef(0);
  const { enabled } = input;

  const requestPhotos = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const sequence = ++requestSequence.current;
    setIsLoading(true);
    try {
      const nextPhotos = await loadRecentPhotos(!hasRequestedPhotoPermission);
      if (sequence === requestSequence.current) {
        setPhotos(nextPhotos);
      }
    } catch (error) {
      console.warn("[RecentPhotos] Failed to load recent photos", error);
      if (sequence === requestSequence.current) {
        setPhotos(EMPTY_PHOTOS);
      }
    } finally {
      if (sequence === requestSequence.current) {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void requestPhotos();
  }, [enabled, requestPhotos]);

  return { photos, isLoading, hasLoaded };
}
