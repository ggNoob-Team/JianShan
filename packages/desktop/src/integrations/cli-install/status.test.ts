import { describe, expect, it } from "vitest";
import { resolveCliInstallStatus } from "./status";

const WINDOWS_ENV: NodeJS.ProcessEnv = { USERPROFILE: "C:\\Users\\Mo" };
const WINDOWS_BIN_DIR = "C:\\Users\\Mo\\.local\\bin";

describe("resolveCliInstallStatus", () => {
  it("does not call a Windows trampoline installed until its directory is on PATH", () => {
    expect(
      resolveCliInstallStatus({
        platform: "win32",
        targetExists: true,
        pathEnv: "C:\\Windows;C:\\Tools",
        binDir: WINDOWS_BIN_DIR,
        env: WINDOWS_ENV,
      }),
    ).toEqual({ installed: false });
  });

  it("reports a Windows install once its command directory is available", () => {
    expect(
      resolveCliInstallStatus({
        platform: "win32",
        targetExists: true,
        pathEnv: "%USERPROFILE%\\.local\\bin;C:\\Windows",
        binDir: WINDOWS_BIN_DIR,
        env: WINDOWS_ENV,
      }),
    ).toEqual({ installed: true });
  });

  it("keeps file-only status semantics on non-Windows platforms", () => {
    expect(
      resolveCliInstallStatus({
        platform: "darwin",
        targetExists: true,
        pathEnv: "/usr/bin:/bin",
        binDir: "/Users/mo/.local/bin",
        env: {},
      }),
    ).toEqual({ installed: true });
  });

  it("reports missing targets as not installed", () => {
    expect(
      resolveCliInstallStatus({
        platform: "linux",
        targetExists: false,
        pathEnv: "/usr/bin:/bin",
        binDir: "/home/mo/.local/bin",
        env: {},
      }),
    ).toEqual({ installed: false });
  });
});
