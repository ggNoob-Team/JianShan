import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { ensureDaemonAutostart, runAutostart } from "./autostart.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("daemon autostart", () => {
  test("installs the bundled CLI in the current-user Windows startup folder", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-autostart-"));
    temporaryDirectories.push(root);
    const appData = path.join(root, "appdata");
    const home = path.join(root, "home");
    const cliShim = "C:\\Program Files\\JianShan\\resources\\bin\\paseo.cmd";

    const state = await runAutostart("enable", home, "win32", {
      APPDATA: appData,
      PASEO_CLI: cliShim,
    });

    expect(state.state).toBe("enabled");
    const startupFile = await readFile(state.path, "utf8");
    expect(startupFile).toContain(cliShim);
    expect(startupFile).toContain('"daemon" "start" "--home"');
  });

  test("keeps a user-disabled startup item disabled after the daemon starts again", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo-autostart-"));
    temporaryDirectories.push(root);
    const appData = path.join(root, "appdata");
    const home = path.join(root, "home");
    const env = { APPDATA: appData, PASEO_CLI: "paseo.cmd" };

    await runAutostart("enable", home, "win32", env);
    const disabled = await runAutostart("disable", home, "win32", env);
    await expect(access(disabled.path)).rejects.toThrow();

    await expect(ensureDaemonAutostart(home, "win32", env)).resolves.toBeNull();
    await expect(access(disabled.path)).rejects.toThrow();

    await runAutostart("enable", home, "win32", env);
    await expect(ensureDaemonAutostart(home, "win32", env)).resolves.toMatchObject({
      state: "enabled",
    });
  });
});
