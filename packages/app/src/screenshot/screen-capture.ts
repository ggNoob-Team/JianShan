export interface ScreenshotSource {
  uri: string;
}

export function isScreenCaptureSupported(): boolean {
  return false;
}

export async function captureCurrentScreen(): Promise<ScreenshotSource> {
  throw new Error("Screen capture is not supported in this environment.");
}
