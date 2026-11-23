export interface AndroidLatestRelease {
  version: string;
  downloadUrl: string;
  sizeLabel?: string;
  sha256?: string;
  publishedAt?: string;
}

export interface AndroidAppUpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  downloadUrl: string | null;
  sizeLabel: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
}

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseVersion(version: string | null | undefined): ParsedVersion | null {
  const normalized = version?.trim().replace(/^v/i, "");
  if (!normalized) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(normalized);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareAndroidVersions(
  left: string | null | undefined,
  right: string | null | undefined,
): number | null {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) return null;

  for (let index = 0; index < leftVersion.core.length; index += 1) {
    const difference = leftVersion.core[index]! - rightVersion.core[index]!;
    if (difference !== 0) return Math.sign(difference);
  }

  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) return 0;
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Math.sign(Number(leftPart) - Number(rightPart));
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

export function isAndroidAppUpdateAvailable(
  currentVersion: string | null | undefined,
  latestVersion: string | null | undefined,
): boolean {
  const comparison = compareAndroidVersions(currentVersion, latestVersion);
  return comparison !== null && comparison < 0;
}

export function parseAndroidLatestRelease(raw: unknown): AndroidLatestRelease {
  if (!isRecord(raw)) throw new Error("Android latest release payload is invalid");
  const version = nonEmptyString(raw.version);
  if (!version) throw new Error("Android latest release is missing a version");

  const downloadCandidate =
    nonEmptyString(raw.downloadUrl) ??
    nonEmptyString(raw.fixedDownloadUrl) ??
    nonEmptyString(raw.siteDownloadUrl) ??
    nonEmptyString(raw.githubDownloadUrl);
  if (!downloadCandidate) {
    throw new Error("Android latest release is missing a download URL");
  }

  let downloadUrl: URL;
  try {
    downloadUrl = new URL(downloadCandidate);
  } catch {
    throw new Error("Android latest release has an invalid download URL");
  }
  if (downloadUrl.protocol !== "https:") {
    throw new Error("Android latest release download URL must use HTTPS");
  }

  return {
    version,
    downloadUrl: downloadUrl.toString(),
    ...(nonEmptyString(raw.sizeLabel) ? { sizeLabel: nonEmptyString(raw.sizeLabel)! } : {}),
    ...(nonEmptyString(raw.sha256) ? { sha256: nonEmptyString(raw.sha256)! } : {}),
    ...(nonEmptyString(raw.publishedAt) ? { publishedAt: nonEmptyString(raw.publishedAt)! } : {}),
  };
}

export async function checkAndroidAppUpdate(input: {
  currentVersion: string | null;
  loadLatest: () => Promise<unknown>;
}): Promise<AndroidAppUpdateCheckResult> {
  const currentVersion = input.currentVersion?.trim() || null;
  if (!currentVersion || compareAndroidVersions(currentVersion, currentVersion) === null) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      downloadUrl: null,
      sizeLabel: null,
      publishedAt: null,
      errorMessage: "The current app version could not be determined",
    };
  }

  try {
    const latest = parseAndroidLatestRelease(await input.loadLatest());
    return {
      hasUpdate: isAndroidAppUpdateAvailable(currentVersion, latest.version),
      currentVersion,
      latestVersion: latest.version,
      downloadUrl: latest.downloadUrl,
      sizeLabel: latest.sizeLabel ?? null,
      publishedAt: latest.publishedAt ?? null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      downloadUrl: null,
      sizeLabel: null,
      publishedAt: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
