import Constants from "expo-constants";
import { Platform } from "react-native";
import { isFdroidBuild } from "@/constants/build-profile";
import { isDev } from "@/constants/platform";
import { openInSystemBrowser } from "@/utils/open-external-url";
import { resolveAppVersion } from "@/utils/app-version";
import {
  checkAndroidAppUpdate as checkAndroidAppUpdateModel,
  parseAndroidLatestRelease,
  type AndroidAppUpdateCheckResult,
  type AndroidLatestRelease,
} from "./android-app-update-model";

export {
  compareAndroidVersions,
  isAndroidAppUpdateAvailable,
  parseAndroidLatestRelease,
  type AndroidAppUpdateCheckResult,
  type AndroidLatestRelease,
} from "./android-app-update-model";

export const ANDROID_LATEST_RELEASE_URL = "https://paseo.zxyz.app/apk/latest.json";
export const ANDROID_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ANDROID_UPDATE_TIMEOUT_MS = 15_000;

async function loadAndroidLatestRelease(): Promise<AndroidLatestRelease> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANDROID_UPDATE_TIMEOUT_MS);
  try {
    const response = await fetch(`${ANDROID_LATEST_RELEASE_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Android update check failed with HTTP ${response.status}`);
    }
    return parseAndroidLatestRelease(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAndroidAppUpdate(input: {
  currentVersion: string | null;
  loadLatest?: () => Promise<unknown>;
}): Promise<AndroidAppUpdateCheckResult> {
  return checkAndroidAppUpdateModel({
    currentVersion: input.currentVersion,
    loadLatest: input.loadLatest ?? loadAndroidLatestRelease,
  });
}

export function resolveAndroidAppVersion(): string | null {
  return Constants.expoConfig?.version?.trim() || resolveAppVersion();
}

export function shouldCheckAndroidAppUpdate(): boolean {
  return (
    Platform.OS === "android" &&
    !isDev &&
    !isFdroidBuild &&
    Constants.expoConfig?.android?.package === "sh.paseo"
  );
}

export async function openAndroidAppUpdate(downloadUrl: string): Promise<void> {
  await openInSystemBrowser(downloadUrl);
}
