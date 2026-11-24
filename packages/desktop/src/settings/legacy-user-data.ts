import path from "node:path";

/**
 * The desktop product was renamed from Paseo to JianShan. Electron derives the
 * default userData directory from the application name, so continuing to use
 * the old directory is required to preserve hosts, settings, window state and
 * renderer storage across upgrades.
 */
export function resolveLegacyUserDataPath(input: {
  appDataPath: string;
  currentName: string;
  legacyName: string;
  pathExists: (candidate: string) => boolean;
}): string | null {
  if (input.currentName === input.legacyName) return null;
  const legacyPath = path.join(input.appDataPath, input.legacyName);
  return input.pathExists(legacyPath) ? legacyPath : null;
}
