import type { ScreenshotSource } from "./screen-capture";

interface HarmonyScreenCaptureBridge {
  capturePage(callback: (resultJson: string) => void): void;
}

interface HarmonyCaptureResponse {
  ok?: boolean;
  dataUrl?: unknown;
  error?: unknown;
}

const CAPTURE_TIMEOUT_MS = 20_000;

function harmonyCaptureBridge(): HarmonyScreenCaptureBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  const bridge = (window as unknown as { paseoScreenCapture?: Partial<HarmonyScreenCaptureBridge> })
    .paseoScreenCapture;
  return typeof bridge?.capturePage === "function" ? (bridge as HarmonyScreenCaptureBridge) : null;
}

export function isScreenCaptureSupported(): boolean {
  return harmonyCaptureBridge() !== null;
}

export async function captureCurrentScreen(): Promise<ScreenshotSource> {
  const bridge = harmonyCaptureBridge();
  if (!bridge) {
    throw new Error("Screen capture is not supported in this browser.");
  }

  const result = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (value === null) {
        reject(new Error("Screen capture timed out."));
      } else {
        resolve(value);
      }
    };
    const timeout = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);
    try {
      bridge.capturePage((resultJson) => {
        clearTimeout(timeout);
        finish(resultJson);
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });

  let parsed: HarmonyCaptureResponse;
  try {
    parsed = JSON.parse(result) as HarmonyCaptureResponse;
  } catch {
    throw new Error("Screen capture returned an invalid response.");
  }
  if (!parsed.ok || typeof parsed.dataUrl !== "string" || parsed.dataUrl.length === 0) {
    throw new Error(typeof parsed.error === "string" ? parsed.error : "Screen capture failed.");
  }
  return { uri: parsed.dataUrl };
}
