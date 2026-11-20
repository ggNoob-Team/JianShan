import image from "@ohos.multimedia.image";
import util from "@ohos.util";
import web_webview from "@ohos.web.webview";
import type { BusinessError } from "@ohos.base";
import hilog from "@ohos.hilog";

const LOG_DOMAIN: number = 0x0000;
const LOG_TAG: string = "PaseoHarmony";

/**
 * Captures the current ArkWeb document for the web editor. webPageSnapshot is
 * intentionally used instead of a React Native screenshot API because the
 * HarmonyOS package is an ArkTS Web shell, not a native React Native runtime.
 */
class ScreenCaptureBridge {
  private controller: web_webview.WebviewController;

  constructor(controller: web_webview.WebviewController) {
    this.controller = controller;
  }

  capturePage(callback: (resultJson: string) => void): void {
    try {
      this.controller.webPageSnapshot({}, (error: BusinessError, result) => {
        void this.encodeSnapshot(error, result, callback);
      });
    } catch (error) {
      hilog.warn(LOG_DOMAIN, LOG_TAG, "screen snapshot failed: %{public}s", `${error}`);
      callback(JSON.stringify({ ok: false, error: "Screen snapshot failed." }));
    }
  }

  private async encodeSnapshot(
    error: BusinessError,
    result: web_webview.SnapshotResult,
    callback: (resultJson: string) => void,
  ): Promise<void> {
    const pixelMap = result.imagePixelMap;
    if (error || !result.status || pixelMap === undefined) {
      hilog.warn(LOG_DOMAIN, LOG_TAG, "screen snapshot unavailable: %{public}s", `${error}`);
      callback(JSON.stringify({ ok: false, error: "Screen snapshot unavailable." }));
      return;
    }

    const packer = image.createImagePacker();
    try {
      const bytes = await packer.packing(pixelMap, {
        format: "image/png",
        quality: 100,
      });
      const dataUrl = `data:image/png;base64,${new util.Base64Helper().encodeToStringSync(
        new Uint8Array(bytes),
      )}`;
      callback(JSON.stringify({ ok: true, dataUrl }));
    } catch (error) {
      hilog.warn(LOG_DOMAIN, LOG_TAG, "screen snapshot encoding failed: %{public}s", `${error}`);
      callback(JSON.stringify({ ok: false, error: "Screen snapshot encoding failed." }));
    } finally {
      await packer.release();
      pixelMap.release();
    }
  }
}

export { ScreenCaptureBridge };
