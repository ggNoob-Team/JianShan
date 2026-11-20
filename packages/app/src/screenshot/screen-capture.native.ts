import { captureScreen } from "react-native-view-shot";

import type { ScreenshotSource } from "./screen-capture";

export function isScreenCaptureSupported(): boolean {
  return true;
}

export async function captureCurrentScreen(): Promise<ScreenshotSource> {
  const uri = await captureScreen({
    format: "png",
    quality: 1,
    result: "tmpfile",
  });
  return { uri };
}
