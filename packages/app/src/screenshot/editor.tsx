/* oxlint-disable react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- The editor is a one-off full-screen surface. */
import { lazy, Suspense, type ComponentType } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import type { ScreenshotEditorProps } from "./editor.impl";

const WebEditor = lazy(async () => {
  const module = await import("./editor.web");
  return { default: module.ScreenshotEditor };
});

const NativeEditor = lazy(async () => {
  const module = await import("./editor.native");
  return { default: module.ScreenshotEditor };
});

function EditorFallback() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}

export function ScreenshotEditor(props: ScreenshotEditorProps) {
  const Editor: ComponentType<ScreenshotEditorProps> =
    Platform.OS === "web" ? WebEditor : NativeEditor;
  return (
    <Suspense fallback={<EditorFallback />}>
      <Editor {...props} />
    </Suspense>
  );
}

export type { ScreenshotEditorProps } from "./editor.impl";
