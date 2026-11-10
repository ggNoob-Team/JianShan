import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ADMIN_HOST = "127.0.0.1";
export const DEFAULT_ADMIN_PORT = 6769;
export const DEFAULT_ADMIN_KEY = "123456";
export const MIN_ADMIN_KEY_LENGTH = 6;

export interface AdminListen {
  host: string;
  port: number;
}

export interface AdminServerInfo {
  pid: number;
  listen: string;
  url: string;
  startedAt: string;
}

export function resolveAdminListen(env: NodeJS.ProcessEnv = process.env): AdminListen {
  const raw = env.PASEO_ADMIN_LISTEN?.trim();
  if (!raw) {
    return { host: DEFAULT_ADMIN_HOST, port: DEFAULT_ADMIN_PORT };
  }
  const match = raw.match(/^(\[[^\]]+\]|[^:]+):(\d{1,5})$/);
  if (!match) {
    throw new Error(`Invalid PASEO_ADMIN_LISTEN value: ${raw}`);
  }
  const host = match[1] === "localhost" ? DEFAULT_ADMIN_HOST : match[1];
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid admin port: ${match[2]}`);
  }
  return { host, port };
}

export function formatAdminListen(listen: AdminListen): string {
  return `${listen.host}:${listen.port}`;
}

export function resolveAdminUrl(listen: AdminListen): string {
  const host = listen.host === "0.0.0.0" || listen.host === "::" ? "127.0.0.1" : listen.host;
  return `http://${host}:${listen.port}/`;
}

export function resolveAdminKeyPath(paseoHome: string): string {
  return path.join(paseoHome, "admin-key");
}

export function resolveAdminStatePath(paseoHome: string): string {
  return path.join(paseoHome, "admin", "server.json");
}

export function resolveAdminUiDir(moduleUrl: string | URL = import.meta.url): string {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const candidates = [path.join(moduleDir, "ui")];
  let current = moduleDir;
  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      candidates.push(
        path.join(current, "src", "server", "admin", "ui"),
        path.join(current, "dist", "server", "server", "admin", "ui"),
      );
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return (
    candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? candidates[0]
  );
}

export async function readAdminKey(paseoHome: string): Promise<string | null> {
  try {
    return normalizeAdminKey(await readFile(resolveAdminKeyPath(paseoHome), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

export function readAdminKeySync(paseoHome: string): string | null {
  try {
    return normalizeAdminKey(readFileSync(resolveAdminKeyPath(paseoHome), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function ensureAdminKey(paseoHome: string): Promise<string> {
  const existing = await readAdminKey(paseoHome);
  if (existing) return existing;
  await setAdminKey(paseoHome, DEFAULT_ADMIN_KEY);
  return DEFAULT_ADMIN_KEY;
}

export async function rotateAdminKey(paseoHome: string): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  await setAdminKey(paseoHome, key);
  return key;
}

export async function setAdminKey(paseoHome: string, value: string): Promise<void> {
  const key = normalizeAdminKey(value);
  if (!key) {
    throw new Error(`管理密钥至少需要 ${MIN_ADMIN_KEY_LENGTH} 个字符，并且不能包含换行`);
  }
  const target = resolveAdminKeyPath(paseoHome);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, `${key}\n`, { mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function normalizeAdminKey(value: string): string | null {
  const key = value.trim();
  return key.length >= MIN_ADMIN_KEY_LENGTH &&
    key.length <= 128 &&
    !/[\r\n]/.test(key) &&
    !key.includes("\0")
    ? key
    : null;
}

export async function writeAdminServerInfo(
  paseoHome: string,
  info: AdminServerInfo,
): Promise<void> {
  const target = resolveAdminStatePath(paseoHome);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, `${JSON.stringify(info, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export async function readAdminServerInfo(paseoHome: string): Promise<AdminServerInfo | null> {
  try {
    const value = JSON.parse(await readFile(resolveAdminStatePath(paseoHome), "utf8")) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.pid !== "number" ||
      typeof record.listen !== "string" ||
      typeof record.url !== "string" ||
      typeof record.startedAt !== "string"
    ) {
      return null;
    }
    return {
      pid: record.pid,
      listen: record.listen,
      url: record.url,
      startedAt: record.startedAt,
    };
  } catch {
    return null;
  }
}

export async function clearAdminServerInfo(paseoHome: string, pid: number): Promise<void> {
  const current = await readAdminServerInfo(paseoHome);
  if (!current || current.pid !== pid) return;
  await unlink(resolveAdminStatePath(paseoHome)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
