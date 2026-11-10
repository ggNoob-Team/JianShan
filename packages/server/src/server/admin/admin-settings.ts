import {
  readPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
} from "../persisted-config.js";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";

const SENSITIVE_KEYS = new Set([
  "password",
  "apikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "clientsecret",
  "authorization",
  "credential",
  "credentials",
  "env",
  "headers",
]);

export function readAdminConfig(paseoHome: string): PersistedConfig {
  return readPersistedConfig(paseoHome, { defaultsIfMissing: true });
}

export function sanitizeAdminConfig(config: PersistedConfig): PersistedConfig {
  return cloneWithoutSensitiveValues(config) as PersistedConfig;
}

export function saveAdminConfig(paseoHome: string, incoming: unknown): PersistedConfig {
  if (!isRecord(incoming)) {
    throw new Error("配置必须是 JSON 对象");
  }
  const current = readAdminConfig(paseoHome);
  const merged = mergeSensitiveValues(current, incoming);
  savePersistedConfig(paseoHome, merged as PersistedConfig);
  return sanitizeAdminConfig(readAdminConfig(paseoHome));
}

export function runtimeAdminConfig(config: MutableDaemonConfig): Record<string, unknown> {
  return {
    daemon: {
      relay: config.relay,
      mcp: config.mcp,
      browserTools: config.browserTools,
      hostnames: config.hostnames,
      cors: config.cors,
      trustedProxies: config.trustedProxies,
      git: config.git,
      autoArchiveAfterMerge: config.autoArchiveAfterMerge,
      enableTerminalAgentHooks: config.enableTerminalAgentHooks,
    },
    app: config.app,
    agents: {
      catalogRefreshTimeoutMs: config.catalogRefreshTimeoutMs,
    },
    pluginsEnabled: config.pluginsEnabled,
  };
}

function cloneWithoutSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneWithoutSensitiveValues);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      isSensitiveKey(key) ? [] : [[key, cloneWithoutSensitiveValues(entry)]],
    ),
  );
}

function mergeSensitiveValues(current: unknown, incoming: unknown): unknown {
  if (!isRecord(current) || !isRecord(incoming)) return incoming;
  const merged = structuredClone(incoming) as Record<string, unknown>;

  for (const [key, currentValue] of Object.entries(current)) {
    if (isSensitiveKey(key)) {
      merged[key] = structuredClone(currentValue);
      continue;
    }
    if (!Object.hasOwn(merged, key)) {
      if (containsSensitiveKey(currentValue)) {
        merged[key] = mergeSensitiveValues(currentValue, {});
      }
      continue;
    }
    merged[key] = mergeSensitiveValues(currentValue, merged[key]);
  }
  return merged;
}

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) => isSensitiveKey(key) || containsSensitiveKey(entry),
  );
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
