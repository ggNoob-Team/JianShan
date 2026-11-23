import { describe, expect, it, vi } from "vitest";
import {
  checkAndroidAppUpdate,
  compareAndroidVersions,
  isAndroidAppUpdateAvailable,
  parseAndroidLatestRelease,
} from "./android-app-update-model";

const LATEST = {
  version: "0.14.1",
  downloadUrl: "https://paseo.zxyz.app/apk/paseo-latest.apk",
  sizeLabel: "159M",
  sha256: "abc123",
  publishedAt: "2026-11-23T04:53:38Z",
};

describe("android app updates", () => {
  it("compares semantic Android versions and prereleases", () => {
    expect(compareAndroidVersions("0.14.0", "0.14.1")).toBeLessThan(0);
    expect(compareAndroidVersions("v0.14.1", "0.14.1")).toBe(0);
    expect(compareAndroidVersions("1.0.0", "1.0.0-beta.2")).toBeGreaterThan(0);
    expect(compareAndroidVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0);
    expect(isAndroidAppUpdateAvailable("0.14.0", "0.14.1")).toBe(true);
    expect(isAndroidAppUpdateAvailable("0.14.1", "0.14.1")).toBe(false);
    expect(isAndroidAppUpdateAvailable("not-a-version", "0.14.1")).toBe(false);
  });

  it("parses the published latest.json payload", () => {
    expect(parseAndroidLatestRelease(LATEST)).toEqual(LATEST);
  });

  it("rejects a release without a usable HTTPS download URL", () => {
    expect(() =>
      parseAndroidLatestRelease({ ...LATEST, downloadUrl: "file:///tmp/app.apk" }),
    ).toThrow("download URL");
    expect(() => parseAndroidLatestRelease({ ...LATEST, version: "" })).toThrow("version");
  });

  it("reports an available update and preserves release metadata", async () => {
    const result = await checkAndroidAppUpdate({
      currentVersion: "0.14.0",
      loadLatest: vi.fn(async () => LATEST),
    });

    expect(result).toMatchObject({
      hasUpdate: true,
      currentVersion: "0.14.0",
      latestVersion: "0.14.1",
      downloadUrl: LATEST.downloadUrl,
      errorMessage: null,
    });
  });

  it("reports up to date without treating an invalid current version as an update", async () => {
    const current = await checkAndroidAppUpdate({
      currentVersion: "0.14.1",
      loadLatest: async () => LATEST,
    });
    const invalid = await checkAndroidAppUpdate({
      currentVersion: null,
      loadLatest: async () => LATEST,
    });

    expect(current.hasUpdate).toBe(false);
    expect(current.errorMessage).toBeNull();
    expect(invalid.hasUpdate).toBe(false);
    expect(invalid.errorMessage).toContain("current app version");
  });

  it("surfaces network and payload failures", async () => {
    const result = await checkAndroidAppUpdate({
      currentVersion: "0.14.0",
      loadLatest: async () => {
        throw new Error("offline");
      },
    });

    expect(result.hasUpdate).toBe(false);
    expect(result.errorMessage).toBe("offline");
  });
});
