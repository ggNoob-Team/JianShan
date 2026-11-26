import { promises as fs } from "node:fs";
import { app } from "electron";
import log from "electron-log/main";
import { resolveCliInstallSourcePath } from "./path.js";
import { getBundledCliShimPath, getCliTargetPath, getLocalBinDir } from "./paths.js";
import { ensureCliPath } from "./shell-rc.js";
import { resolveCliInstallStatus, type InstallStatus } from "./status.js";

async function pathOrSymlinkExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

function resolveInstallSourcePath(shimPath: string): string {
  return resolveCliInstallSourcePath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    executablePath: app.getPath("exe"),
    shimPath,
    appImagePath: process.env.APPIMAGE,
  });
}

// A thin .cmd trampoline that delegates to the bundled shim. Only the app install path is baked
// in — internal details (asar layout, entrypoint scripts) live in the bundled shim and update with
// the app.
function buildCmdTrampoline(shimPath: string): string {
  return [
    "@echo off",
    `set "BUNDLED_CLI=${shimPath}"`,
    `if not exist "%BUNDLED_CLI%" (`,
    `  echo Paseo CLI not found at %BUNDLED_CLI% — is Paseo installed? 1>&2`,
    `  exit /b 1`,
    `)`,
    `call "%BUNDLED_CLI%" %*`,
    `exit /b %errorlevel%`,
  ].join("\r\n");
}

export async function installCli(): Promise<InstallStatus> {
  const targetPath = getCliTargetPath();
  const shimPath = getBundledCliShimPath();

  await fs.mkdir(getLocalBinDir(), { recursive: true });
  if (await pathOrSymlinkExists(targetPath)) {
    await fs.unlink(targetPath);
  }
  if (process.platform === "win32") {
    if (await pathOrSymlinkExists(targetPath)) {
      await fs.unlink(targetPath);
    }
    // Generate a thin .cmd trampoline that delegates to the bundled shim.
    // Only the app install path is baked in — internal details (asar layout,
    // entrypoint scripts) live in the bundled shim and update with the app.
    const cmdContent = [
      "@echo off",
      `set "BUNDLED_CLI=${shimPath}"`,
      `if not exist "%BUNDLED_CLI%" (`,
      `  echo JianShan CLI not found at %BUNDLED_CLI% — is JianShan installed? 1>&2`,
      `  exit /b 1`,
      `)`,
      `call "%BUNDLED_CLI%" %*`,
      `exit /b %errorlevel%`,
    ].join("\r\n");
    await fs.writeFile(targetPath, cmdContent, "utf-8");
  } else {
    await fs.symlink(resolveInstallSourcePath(shimPath), targetPath);
  }

  const { shellUpdated } = await ensureCliPath();
  if (shellUpdated) {
    log.info("[integrations] Updated the CLI command path");
  }

  return getCliInstallStatus();
}

/**
 * Removes the CLI only when the file at the target is the one this app installs, so a `paseo` the
 * user put there some other way survives. The shell rc PATH line stays: it is harmless and other
 * tools in ~/.local/bin rely on it.
 */
export async function uninstallCli(): Promise<InstallStatus> {
  const targetPath = getCliTargetPath();
  if (await isOwnInstall(targetPath)) {
    await fs.unlink(targetPath);
  } else if (await pathOrSymlinkExists(targetPath)) {
    log.warn("[integrations] Left a paseo CLI this app did not install", { targetPath });
  }
  return getCliInstallStatus();
}

async function isOwnInstall(targetPath: string): Promise<boolean> {
  const shimPath = getBundledCliShimPath();
  try {
    if (process.platform === "win32") {
      return (await fs.readFile(targetPath, "utf-8")) === buildCmdTrampoline(shimPath);
    }
    return (await fs.readlink(targetPath)) === resolveInstallSourcePath(shimPath);
  } catch {
    return false;
  }
}

export async function getCliInstallStatus(): Promise<InstallStatus> {
  const targetPath = getCliTargetPath();
  const targetExists = await pathOrSymlinkExists(targetPath);
  return resolveCliInstallStatus({
    platform: process.platform,
    targetExists,
    pathEnv: process.env.PATH,
    binDir: getLocalBinDir(),
    env: process.env,
  });
}
