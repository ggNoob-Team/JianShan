import { useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HEADER_TOP_PADDING_MOBILE } from "@/constants/layout";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { ResizeHandle } from "@/components/resize-handle";
import {
  resolveExplorerSidebarDockSizes,
  resolveExplorerSidebarWidth,
} from "@/components/explorer-sidebar-layout";
import type { ExplorerGeometryInput, ExplorerGeometry } from "./geometry-types";
export function useExplorerGeometry({
  width,
  containerWidth,
  onResize,
  overlay,
}: ExplorerGeometryInput): ExplorerGeometry {
  const insets = useSafeAreaInsets();
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const requestedWidth = previewWidth ?? width;
  const sizes = resolveExplorerSidebarDockSizes({ requestedWidth, containerWidth });
  const preview = useCallback(
    (_id: string, next: number[]) => {
      setPreviewWidth(
        resolveExplorerSidebarWidth({ requestedWidth: next[1] * containerWidth, containerWidth }),
      );
    },
    [containerWidth],
  );
  const commit = useCallback(
    (_id: string, next: number[]) => {
      setPreviewWidth(null);
      onResize(
        resolveExplorerSidebarWidth({ requestedWidth: next[1] * containerWidth, containerWidth }),
      );
    },
    [containerWidth, onResize],
  );
  return {
    frameStyle: inlineUnistylesStyle({ width: overlay ? undefined : requestedWidth }),
    panelStyle: {
      paddingTop: insets.top + (overlay ? HEADER_TOP_PADDING_MOBILE : 0),
      paddingLeft: overlay ? insets.left : 0,
      paddingRight: overlay ? insets.right : 0,
    },
    resizeHandle: (
      <View style={styles.resize}>
        <ResizeHandle
          testID="workspace-explorer-sidebar-resize-handle"
          direction="horizontal"
          hitAreaAlignment="end"
          groupId="explorer-sidebar"
          index={0}
          sizes={sizes}
          containerSize={containerWidth}
          onPreviewResizeSplit={preview}
          onResizeSplit={commit}
        />
      </View>
    ),
  };
}
const styles = StyleSheet.create({
  resize: { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 2, flexDirection: "row" },
});
