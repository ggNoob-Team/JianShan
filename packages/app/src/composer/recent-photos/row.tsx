import { useCallback, useEffect, useMemo } from "react";
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { MenuSeparator, menuRowContentInset, useMenuContext } from "@/components/ui/menu";
import { PressHighlight } from "@/components/ui/press-highlight";
import { RECENT_PHOTO_LIMIT, type RecentPhoto } from "./model";
import { useRecentPhotos } from "./use-recent-photos";

const SKELETON_KEYS = Array.from({ length: RECENT_PHOTO_LIMIT }, (_, index) => `photo-${index}`);

function RecentPhotoTile({
  photo,
  onSelect,
}: {
  photo: RecentPhoto;
  onSelect: (photo: RecentPhoto) => void;
}) {
  const { selectItem } = useMenuContext("RecentPhotoTile");
  const { t } = useTranslation();
  const source = useMemo(() => ({ uri: photo.previewUri }), [photo.previewUri]);
  const handlePress = useCallback(() => {
    selectItem(() => onSelect(photo), false);
  }, [onSelect, photo, selectItem]);

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={t("composer.attachments.addImage")}
      onPress={handlePress}
      highlightStyle={styles.tileHighlight}
      style={styles.tile}
      testID={`composer-recent-photo-${photo.assetId}`}
    >
      <Image source={source} resizeMode="cover" style={styles.thumbnail} />
    </PressHighlight>
  );
}

export function RecentPhotosRow({ onSelect }: { onSelect: (photo: RecentPhoto) => void }) {
  const { open, bumpRevision } = useMenuContext("RecentPhotosRow");
  const { photos, isLoading, hasLoaded } = useRecentPhotos({ enabled: open });
  const showSkeleton = photos.length === 0 && (!hasLoaded || isLoading);

  useEffect(() => {
    if (open) {
      bumpRevision();
    }
  }, [bumpRevision, hasLoaded, isLoading, open, photos.length]);

  if (!showSkeleton && photos.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.container} testID="composer-recent-photos">
        <View style={styles.row}>
          {showSkeleton
            ? SKELETON_KEYS.map((key) => <View key={key} style={[styles.tile, styles.skeleton]} />)
            : photos.map((photo) => (
                <RecentPhotoTile key={photo.assetId} photo={photo} onSelect={onSelect} />
              ))}
        </View>
      </View>
      <MenuSeparator />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: menuRowContentInset(theme),
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  tile: {
    flex: 1,
    maxWidth: 72,
    aspectRatio: 1,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  tileHighlight: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  skeleton: {
    backgroundColor: theme.colors.surface2,
  },
}));
