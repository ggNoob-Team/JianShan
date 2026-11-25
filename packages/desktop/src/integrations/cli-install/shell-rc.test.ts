import { describe, expect, it, vi } from "vitest";

vi.mock("electron-log/main", () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}));

import { ensureCliPath } from "./shell-rc";

describe("ensureCliPath", () => {
  it("persists the Windows CLI directory and updates the current process PATH", async () => {
    const env: NodeJS.ProcessEnv = {
      PATH: "C:\\Windows",
      USERPROFILE: "C:\\Users\\Mo",
    };
    const windowsPathUpdater = vi.fn(async () => ({ updated: true }));

    await expect(
      ensureCliPath({
        platform: "win32",
        env,
        homeDir: "C:\\Users\\Mo",
        windowsPathUpdater,
      }),
    ).resolves.toEqual({ shellUpdated: true });

    expect(windowsPathUpdater).toHaveBeenCalledWith("C:\\Users\\Mo\\.local\\bin", env);
    expect(env.PATH).toBe("C:\\Windows;C:\\Users\\Mo\\.local\\bin");
  });

  it("propagates a Windows PATH update failure so the install is not reported as successful", async () => {
    const env: NodeJS.ProcessEnv = {
      PATH: "C:\\Windows",
      USERPROFILE: "C:\\Users\\Mo",
    };

    await expect(
      ensureCliPath({
        platform: "win32",
        env,
        homeDir: "C:\\Users\\Mo",
        windowsPathUpdater: async () => {
          throw new Error("PowerShell failed");
        },
      }),
    ).rejects.toThrow("PowerShell failed");
  });
});
