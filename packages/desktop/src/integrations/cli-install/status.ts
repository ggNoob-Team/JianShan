import { windowsPathContainsEntry } from "./windows-path.js";

export interface InstallStatus {
  installed: boolean;
}

export interface ResolveCliInstallStatusInput {
  platform: NodeJS.Platform;
  targetExists: boolean;
  pathEnv: string | undefined;
  binDir: string;
  env: NodeJS.ProcessEnv;
}

export function resolveCliInstallStatus(input: ResolveCliInstallStatusInput): InstallStatus {
  if (!input.targetExists) return { installed: false };
  if (input.platform !== "win32") return { installed: true };
  return {
    installed: windowsPathContainsEntry(input.pathEnv, input.binDir, input.env),
  };
}
