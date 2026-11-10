import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Command } from "commander";

import { withOutput, type CommandOptions } from "../../output/index.js";
import { addLocalDaemonOptions } from "../../utils/command-options.js";

const execFileAsync = promisify(execFile);
const SERVICE_NAME = "paseo-daemon.service";

export function daemonAutostartCommand(): Command {
  const command = new Command("autostart").description(
    "Install the daemon in the current user's login startup",
  );
  for (const action of ["enable", "disable", "status"] as const) {
    command
      .command(action)
      .description(`${action[0]!.toUpperCase()}${action.slice(1)} current-user daemon startup`)
      .action(
        withOutput(async (options: CommandOptions, _command: Command) => {
          if (options.daemonTarget.kind !== "instance") {
            throw new Error("Autostart requires a local Paseo home.");
          }
          const state = await runAutostart(
            action,
            options.daemonTarget.home,
            process.platform,
            process.env,
          );
          return {
            type: "single" as const,
            data: state,
            schema: {
              idField: "state",
              columns: [],
              renderHuman: () => `Autostart: ${state.state}\n${state.path}`,
            },
          };
        }),
      );
    addLocalDaemonOptions(command.commands.at(-1)!);
  }
  return command;
}

export interface AutostartState {
  platform: NodeJS.Platform;
  state: "enabled" | "disabled";
  path: string;
}

export async function runAutostart(
  action: "enable" | "disable" | "status",
  paseoHome: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AutostartState> {
  let state: AutostartState;
  if (platform === "linux") {
    state = await runLinuxAutostart(action, paseoHome, env);
  } else if (platform === "win32") {
    state = await runWindowsAutostart(action, paseoHome, env);
  } else {
    throw new Error(`Current-user autostart is not implemented for ${platform}`);
  }
  if (action === "disable") {
    await writeAutostartPreference(paseoHome, { userDisabled: true });
  } else if (action === "enable") {
    await rm(resolveAutostartPreferencePath(paseoHome), { force: true });
  }
  return state;
}

export async function ensureDaemonAutostart(
  paseoHome: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AutostartState | null> {
  if (env.PASEO_AUTOSTART_DISABLED === "1") return null;
  if ((await readAutostartPreference(paseoHome)).userDisabled) return null;
  const current = await runAutostart("status", paseoHome, platform, env);
  if (current.state === "enabled") return current;
  return await runAutostart("enable", paseoHome, platform, env);
}

function resolveAutostartPreferencePath(paseoHome: string): string {
  return path.join(paseoHome, "admin", "autostart.json");
}

async function readAutostartPreference(paseoHome: string): Promise<{ userDisabled: boolean }> {
  try {
    const parsed = JSON.parse(
      await readFile(resolveAutostartPreferencePath(paseoHome), "utf8"),
    ) as unknown;
    return {
      userDisabled:
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as Record<string, unknown>).userDisabled === true,
    };
  } catch {
    return { userDisabled: false };
  }
}

async function writeAutostartPreference(
  paseoHome: string,
  preference: { userDisabled: boolean },
): Promise<void> {
  const target = resolveAutostartPreferencePath(paseoHome);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, `${JSON.stringify(preference, null, 2)}\n`, { mode: 0o600 });
}

async function runLinuxAutostart(
  action: "enable" | "disable" | "status",
  paseoHome: string,
  env: NodeJS.ProcessEnv,
): Promise<AutostartState> {
  const configHome = env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  const unitPath = path.join(configHome, "systemd", "user", SERVICE_NAME);
  if (action === "disable") {
    await execFileAsync("systemctl", ["--user", "disable", "--now", SERVICE_NAME]).catch(
      () => undefined,
    );
    await rm(unitPath, { force: true });
    await execFileAsync("systemctl", ["--user", "daemon-reload"]).catch(() => undefined);
    return { platform: "linux", state: "disabled", path: unitPath };
  }
  if (action === "status") {
    return {
      platform: "linux",
      state: (await fileExists(unitPath)) ? "enabled" : "disabled",
      path: unitPath,
    };
  }

  const command = autostartInvocation("start", paseoHome, env).map(systemdQuote).join(" ");
  const stopCommand = autostartInvocation("stop", paseoHome, env).map(systemdQuote).join(" ");
  await mkdir(path.dirname(unitPath), { recursive: true, mode: 0o700 });
  await writeFile(
    unitPath,
    [
      "[Unit]",
      "Description=JianShan daemon and local admin console",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=oneshot",
      "RemainAfterExit=yes",
      `Environment=${systemdQuote(`PASEO_HOME=${paseoHome}`)}`,
      `ExecStart=${command}`,
      `ExecStop=${stopCommand}`,
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await chmod(unitPath, 0o600);
  await execFileAsync("systemctl", ["--user", "daemon-reload"]);
  await execFileAsync("systemctl", ["--user", "enable", "--now", SERVICE_NAME]);
  return { platform: "linux", state: "enabled", path: unitPath };
}

async function runWindowsAutostart(
  action: "enable" | "disable" | "status",
  paseoHome: string,
  env: NodeJS.ProcessEnv,
): Promise<AutostartState> {
  const appData = env.APPDATA?.trim();
  if (!appData) throw new Error("APPDATA is not available");
  const startupDir = path.join(
    appData,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  const startupPath = path.join(startupDir, "Paseo Daemon.cmd");
  if (action === "disable") {
    await rm(startupPath, { force: true });
    return { platform: "win32", state: "disabled", path: startupPath };
  }
  if (action === "status") {
    return {
      platform: "win32",
      state: (await fileExists(startupPath)) ? "enabled" : "disabled",
      path: startupPath,
    };
  }
  await mkdir(startupDir, { recursive: true });
  const invocation = autostartInvocation("start", paseoHome, env).map(cmdQuote).join(" ");
  await writeFile(
    startupPath,
    ["@echo off", "setlocal", `start "" /min ${invocation}`, "endlocal", ""].join("\r\n"),
    { mode: 0o600 },
  );
  return { platform: "win32", state: "enabled", path: startupPath };
}

function autostartInvocation(
  action: "start" | "stop",
  paseoHome: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const cliShim = env.PASEO_CLI?.trim();
  return [
    ...(cliShim ? [cliShim] : [process.execPath, process.argv[1]!]),
    "daemon",
    action,
    "--home",
    paseoHome,
  ];
}

function systemdQuote(value: string): string {
  return `"${value.replaceAll("%", "%%").replaceAll('"', '\\"').replaceAll("$", "\\$")}"`;
}

function cmdQuote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
