import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import log from "electron-log/main";
import { appendWindowsPathEntry } from "./windows-path.js";

export interface ShellRcInfo {
  shell: string;
  rcFile: string;
  pathCheckPattern: RegExp;
  exportLine: string;
}

interface WindowsPathUpdaterResult {
  updated: boolean;
}

export interface EnsureCliPathOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  windowsPathUpdater?: (
    binDir: string,
    env: NodeJS.ProcessEnv,
  ) => WindowsPathUpdaterResult | Promise<WindowsPathUpdaterResult>;
}

const WINDOWS_CLI_PATH_ENV = "PASEO_CLI_BIN_DIR";

const WINDOWS_USER_PATH_SCRIPT = `
$ErrorActionPreference = 'Stop'
$bin = [Environment]::GetEnvironmentVariable('${WINDOWS_CLI_PATH_ENV}', 'Process')
if ([string]::IsNullOrWhiteSpace($bin)) {
  throw 'The CLI bin directory was not provided.'
}

$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
if ($null -eq $key) {
  throw 'Unable to open the current user environment registry key.'
}

try {
  $current = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  if ($null -eq $current) {
    $current = ''
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
  } else {
    $kind = $key.GetValueKind('Path')
  }

  $trimChars = [char[]]@([char]47, [char]92)
  $normalizedBin = $bin.Trim().Trim('"').Replace('/', [IO.Path]::DirectorySeparatorChar).TrimEnd($trimChars)
  $isPresent = $false
  foreach ($entry in (([string]$current) -split ';')) {
    if ([string]::IsNullOrWhiteSpace($entry)) {
      continue
    }
    $expandedEntry = [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"'))
    $normalizedEntry = $expandedEntry.Replace('/', [IO.Path]::DirectorySeparatorChar).TrimEnd($trimChars)
    if ([string]::Equals($normalizedEntry, $normalizedBin, [StringComparison]::OrdinalIgnoreCase)) {
      $isPresent = $true
      break
    }
  }

  if ($isPresent) {
    Write-Output 'unchanged'
  } else {
    $next = if ([string]::IsNullOrWhiteSpace([string]$current)) {
      $bin
    } else {
      ([string]$current).TrimEnd(';') + ';' + $bin
    }
    $key.SetValue('Path', $next, $kind)

    try {
      $signature = '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
      $broadcastType = Add-Type -MemberDefinition $signature -Name 'PaseoEnvironmentBroadcast' -Namespace 'Win32' -PassThru
      $result = [UIntPtr]::Zero
      $null = $broadcastType::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
    } catch {
      # The registry update is authoritative; Explorer will also refresh PATH on its next launch.
    }

    Write-Output 'updated'
  }
} finally {
  $key.Close()
}
`.trim();

async function pathOrSymlinkExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

export function detectShellRcInfo(): ShellRcInfo | null {
  if (process.platform === "win32") return null;

  const shell = process.env.SHELL;
  if (!shell) return null;

  const shellName = path.basename(shell);

  if (shellName === "zsh") {
    return {
      shell: "zsh",
      rcFile: path.join(os.homedir(), ".zshrc"),
      pathCheckPattern: /\.local\/bin/,
      exportLine: 'export PATH="$HOME/.local/bin:$PATH"',
    };
  }

  if (shellName === "bash") {
    const rcFile =
      process.platform === "darwin"
        ? path.join(os.homedir(), ".bash_profile")
        : path.join(os.homedir(), ".bashrc");
    return {
      shell: "bash",
      rcFile,
      pathCheckPattern: /\.local\/bin/,
      exportLine: 'export PATH="$HOME/.local/bin:$PATH"',
    };
  }

  if (shellName === "fish") {
    return {
      shell: "fish",
      rcFile: path.join(os.homedir(), ".config", "fish", "config.fish"),
      pathCheckPattern: /\.local\/bin/,
      exportLine: "fish_add_path $HOME/.local/bin",
    };
  }

  return null;
}

export function pathAlreadyContainsLocalBin(): boolean {
  const pathEnv = process.env.PATH ?? "";
  const localBin = path.join(os.homedir(), ".local", "bin");
  return pathEnv.split(path.delimiter).some((p) => p === localBin || p === "~/.local/bin");
}

function updateWindowsUserPath(binDir: string, env: NodeJS.ProcessEnv): WindowsPathUpdaterResult {
  let stdout: string;
  try {
    stdout = execFileSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        WINDOWS_USER_PATH_SCRIPT,
      ],
      {
        encoding: "utf8",
        env: { ...env, [WINDOWS_CLI_PATH_ENV]: binDir },
        timeout: 15_000,
        windowsHide: true,
      },
    ).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to update the Windows user PATH: ${message}`, { cause: error });
  }

  const result = stdout.split(/\r?\n/).at(-1)?.trim();
  if (result === "updated") return { updated: true };
  if (result === "unchanged") return { updated: false };
  throw new Error(`Unexpected Windows PATH update result: ${stdout || "(empty)"}`);
}

export async function ensureCliPath(
  input: EnsureCliPathOptions = {},
): Promise<{ shellUpdated: boolean }> {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;

  if (platform === "win32") {
    const binDir = path.win32.join(input.homeDir ?? os.homedir(), ".local", "bin");
    const updater = input.windowsPathUpdater ?? updateWindowsUserPath;
    const result = await updater(binDir, env);
    env.PATH = appendWindowsPathEntry(env.PATH, binDir, env).path;
    return { shellUpdated: result.updated };
  }

  if (pathAlreadyContainsLocalBin()) {
    return { shellUpdated: false };
  }

  const info = detectShellRcInfo();
  if (!info) {
    return { shellUpdated: false };
  }

  try {
    const exists = await pathOrSymlinkExists(info.rcFile);
    if (exists) {
      const content = await fs.readFile(info.rcFile, "utf-8");
      if (info.pathCheckPattern.test(content)) {
        return { shellUpdated: false };
      }
    }

    await fs.mkdir(path.dirname(info.rcFile), { recursive: true });
    await fs.appendFile(info.rcFile, `\n# Added by JianShan\n${info.exportLine}\n`);

    return { shellUpdated: true };
  } catch (err) {
    log.warn("[integrations] Failed to update shell rc file", { rcFile: info.rcFile, err });
    return { shellUpdated: false };
  }
}
