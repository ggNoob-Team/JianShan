import * as Linking from "expo-linking";
import { queryClient } from "@/data/query-client";
import { getDesktopHost } from "@/desktop/host";
import {
  APP_SETTINGS_QUERY_KEY,
  DEFAULT_CLIENT_SETTINGS,
  normalizeAppSettings,
} from "@/hooks/use-settings/storage";
import { isWeb } from "@/constants/platform";
import { openUrlInWorkspaceTab } from "@/workspace-tabs/url-opener";

import { isHttpUrl } from "./http-url";

export async function openExternalUrl(url: string): Promise<void> {
  if (!isHttpUrl(url)) return;
  if (getLinkOpenBehavior() === "webview" && openUrlInWorkspaceTab(url)) {
    return;
  }
  await openInSystemBrowser(url);
}

/** Opens a URL outside Paseo, bypassing the workspace-tab preference. */
export async function openInSystemBrowser(url: string): Promise<void> {
  if (!isHttpUrl(url)) return;
  if (isWeb) {
    const opener = getDesktopHost()?.opener?.openUrl;
    if (typeof opener === "function") {
      await opener(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  await Linking.openURL(url);
}

function getLinkOpenBehavior() {
  const stored = queryClient.getQueryData(APP_SETTINGS_QUERY_KEY);
  if (stored === undefined) {
    return DEFAULT_CLIENT_SETTINGS.linkOpenBehavior;
  }
  return normalizeAppSettings(stored).linkOpenBehavior;
}
