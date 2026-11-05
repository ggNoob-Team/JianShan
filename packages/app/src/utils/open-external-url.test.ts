import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Linking from "expo-linking";
import { queryClient } from "@/data/query-client";
import { APP_SETTINGS_QUERY_KEY, DEFAULT_CLIENT_SETTINGS } from "@/hooks/use-settings/storage";
import { registerWorkspaceUrlOpener } from "@/workspace-tabs/url-opener";
import { openExternalUrl } from "./open-external-url";

vi.mock("expo-linking", () => ({
  openURL: vi.fn(async () => undefined),
}));
vi.mock("@/constants/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/constants/platform")>();
  return { ...actual, isWeb: false };
});

let unregisterWorkspaceUrlOpener: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

afterEach(() => {
  unregisterWorkspaceUrlOpener?.();
  unregisterWorkspaceUrlOpener = null;
});

describe("external URL refusal", () => {
  it.each(["mailto:person@example.com", "javascript:alert(1)", "/relative", "invalid"])(
    "safely ignores %s for fire-and-forget callers",
    async (url) => {
      await expect(openExternalUrl(url)).resolves.toBeUndefined();
      expect(Linking.openURL).not.toHaveBeenCalled();
    },
  );
});

describe("link opening preference", () => {
  it("uses the system browser by default", async () => {
    const openUrl = vi.fn(() => true);
    unregisterWorkspaceUrlOpener = registerWorkspaceUrlOpener({
      workspaceKey: "server:workspace",
      openUrl,
    });

    await openExternalUrl("https://example.com");

    expect(openUrl).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith("https://example.com");
  });

  it("opens the active workspace browser tab when configured", async () => {
    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, {
      ...DEFAULT_CLIENT_SETTINGS,
      linkOpenBehavior: "webview",
    });
    const openUrl = vi.fn(() => true);
    unregisterWorkspaceUrlOpener = registerWorkspaceUrlOpener({
      workspaceKey: "server:workspace",
      openUrl,
    });

    await openExternalUrl("https://example.com/docs");

    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("falls back to the system browser when no workspace can take the tab", async () => {
    queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, {
      ...DEFAULT_CLIENT_SETTINGS,
      linkOpenBehavior: "webview",
    });
    unregisterWorkspaceUrlOpener = registerWorkspaceUrlOpener({
      workspaceKey: "server:workspace",
      openUrl: () => false,
    });

    await openExternalUrl("https://example.com/docs");

    expect(Linking.openURL).toHaveBeenCalledWith("https://example.com/docs");
  });
});
