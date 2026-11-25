import path from "node:path";

function readEnvironmentValue(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const normalizedName = name.toLowerCase();
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === normalizedName);
  return key ? env[key] : undefined;
}

function expandEnvironmentVariables(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (match, rawName: string) => {
    return readEnvironmentValue(rawName, env) ?? match;
  });
}

function normalizeWindowsPathEntry(value: string, env: NodeJS.ProcessEnv): string {
  let expanded = value.trim();
  if (expanded.startsWith('"') && expanded.endsWith('"')) {
    expanded = expanded.slice(1, -1).trim();
  }
  if (!expanded) return "";
  expanded = expandEnvironmentVariables(expanded, env);

  const homeDirectory = env.USERPROFILE ?? env.HOME;
  if (homeDirectory && /^~([\\/]|$)/.test(expanded)) {
    expanded = `${homeDirectory}${expanded.slice(1)}`;
  }

  const normalized = path.win32.normalize(expanded.replaceAll("/", "\\"));
  const root = path.win32.parse(normalized).root;
  const withoutTrailingSeparator =
    normalized === root ? normalized : normalized.replace(/\\+$/, "");
  return withoutTrailingSeparator.toLowerCase();
}

function splitWindowsPath(currentPath: string | null | undefined): string[] {
  if (!currentPath) return [];
  return currentPath.split(";").filter((entry) => entry.trim().length > 0);
}

export function windowsPathContainsEntry(
  currentPath: string | null | undefined,
  entry: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalizedEntry = normalizeWindowsPathEntry(entry, env);
  if (!normalizedEntry) return false;
  return splitWindowsPath(currentPath).some(
    (existing) => normalizeWindowsPathEntry(existing, env) === normalizedEntry,
  );
}

export function appendWindowsPathEntry(
  currentPath: string | null | undefined,
  entry: string,
  env: NodeJS.ProcessEnv = process.env,
): { path: string; changed: boolean } {
  const current = currentPath?.trim() ?? "";
  if (windowsPathContainsEntry(current, entry, env)) {
    return { path: currentPath ?? "", changed: false };
  }
  if (!current) {
    return { path: entry, changed: true };
  }
  return {
    path: `${current.replace(/;+$/, "")};${entry}`,
    changed: true,
  };
}
