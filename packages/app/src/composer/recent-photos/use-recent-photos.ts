import { useEffect, useRef, useState } from "react";
import {
  hasHarmonyPhotoLibrary,
  requestRecentPhotosFromHarmony,
  type HarmonyRecentPhoto,
} from "./harmony-bridge";
import { selectRecentPhotos, type RecentPhoto, type RecentPhotoCandidate } from "./model";

const EMPTY_PHOTOS: RecentPhoto[] = [];

export interface UseRecentPhotosResult {
  photos: RecentPhoto[];
  isLoading: boolean;
  hasLoaded: boolean;
}

function toCandidate(photo: HarmonyRecentPhoto): RecentPhotoCandidate {
  return {
    assetId: photo.assetId,
    previewUri: photo.previewUri,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
  };
}

export function useRecentPhotos(input: { enabled: boolean }): UseRecentPhotosResult {
  const [photos, setPhotos] = useState<RecentPhoto[]>(EMPTY_PHOTOS);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestSequence = useRef(0);
  const { enabled } = input;

  useEffect(() => {
    if (!enabled || !hasHarmonyPhotoLibrary()) {
      return;
    }
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    void requestRecentPhotosFromHarmony()
      .then((result) => {
        if (sequence === requestSequence.current) {
          setPhotos(selectRecentPhotos(result.map(toCandidate)));
        }
        return undefined;
      })
      .catch(() => {
        if (sequence === requestSequence.current) {
          setPhotos(EMPTY_PHOTOS);
        }
        return undefined;
      })
      .finally(() => {
        if (sequence === requestSequence.current) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      });
  }, [enabled]);

  return { photos, isLoading, hasLoaded };
}
