import AbilityConstant from "@ohos.app.ability.AbilityConstant";
import UIAbility from "@ohos.app.ability.UIAbility";
import Want from "@ohos.app.ability.Want";
import type { BusinessError } from "@ohos.base";
import hilog from "@ohos.hilog";
import window from "@ohos.window";
import web_webview from "@ohos.web.webview";
import { PASEO_SCHEME } from "../web/rawfile-assets";

const LOG_DOMAIN: number = 0x0000;
const LOG_TAG: string = "PaseoHarmony";

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(LOG_DOMAIN, LOG_TAG, "onCreate");
    // Must run before any Web component is initialized. isSecure gives the page
    // a secure context (clipboard, getUserMedia); isStandard makes it a real
    // origin, which is what the daemon's WebSocket origin check needs.
    try {
      web_webview.WebviewController.customizeSchemes([
        {
          schemeName: PASEO_SCHEME,
          isSupportCORS: true,
          isSupportFetch: true,
          isStandard: true,
          isSecure: true,
        },
      ]);
    } catch (error) {
      hilog.error(
        LOG_DOMAIN,
        LOG_TAG,
        "customizeSchemes failed: %{public}s",
        JSON.stringify(error),
      );
    }
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Lay the page out behind the status bar and navigation indicator. The page
    // itself then expands its safe area (pages/Index.ets), so the Web component
    // covers the whole window and the web app can paint edge to edge.
    try {
      windowStage
        .getMainWindowSync()
        .setWindowLayoutFullScreen(true)
        .catch((error: BusinessError) => {
          hilog.warn(LOG_DOMAIN, LOG_TAG, "full-screen layout failed: %{public}s", `${error}`);
        });
    } catch (error) {
      hilog.warn(LOG_DOMAIN, LOG_TAG, "full-screen layout failed: %{public}s", `${error}`);
    }
    windowStage.loadContent("pages/Index", (err: BusinessError) => {
      if (err.code) {
        hilog.error(LOG_DOMAIN, LOG_TAG, "loadContent failed: %{public}s", JSON.stringify(err));
        return;
      }
      hilog.info(LOG_DOMAIN, LOG_TAG, "loadContent succeeded");
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(LOG_DOMAIN, LOG_TAG, "onWindowStageDestroy");
  }

  onForeground(): void {
    hilog.info(LOG_DOMAIN, LOG_TAG, "onForeground");
  }

  onBackground(): void {
    hilog.info(LOG_DOMAIN, LOG_TAG, "onBackground");
  }

  onDestroy(): void {
    hilog.info(LOG_DOMAIN, LOG_TAG, "onDestroy");
  }
}
