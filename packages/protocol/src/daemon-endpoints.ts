import type { ConnectionOfferV2 } from "./connection-offer.js";

export interface HostPortParts {
  host: string;
  port: number;
  isIpv6: boolean;
}

export interface ConnectionUriParts extends HostPortParts {
  useTls: boolean;
}

export interface ParsedConnectionUri extends ConnectionUriParts {
  password?: string;
}

export interface ParsedRelayConnectionUri {
  offer: ConnectionOfferV2;
  password?: string;
}

function decodeRelayUriComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    throw new Error("Invalid relay connection URI");
  }
}

function parseRelaySearchParams(input: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of input.split("&")) {
    if (!part) continue;
    const separatorIndex = part.indexOf("=");
    const rawKey = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
    const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";
    const key = decodeRelayUriComponent(rawKey);
    if (!params.has(key)) {
      params.set(key, decodeRelayUriComponent(rawValue));
    }
  }
  return params;
}

export function parseRelayConnectionUri(input: string): ParsedRelayConnectionUri {
  const trimmed = input.trim();
  const connectIndex = trimmed.indexOf("#connect=");
  let uri = trimmed;
  if (connectIndex >= 0) {
    try {
      uri = decodeURIComponent(trimmed.slice(connectIndex + "#connect=".length));
    } catch {
      throw new Error("Invalid relay connection URI");
    }
  }

  // Hermes does not reliably parse custom URL schemes, so parse the fixed relay
  // URI shape directly instead of depending on URL.hostname/port and searchParams.
  const match = /^relay:\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i.exec(uri);
  if (!match) {
    throw new Error("Invalid relay connection URI");
  }
  const authority = match[1];
  if (!authority || authority.includes("@")) {
    throw new Error("Invalid relay connection URI");
  }
  const serverId = decodeRelayUriComponent((match[2] ?? "").slice(1));
  const params = parseRelaySearchParams(match[3] ?? "");
  const key = params.get("key");
  if (!serverId || !key || serverId.includes("/")) {
    throw new Error("Relay connection URI requires a server id and key");
  }
  const endpoint = normalizeHostPort(authority);
  const password = params.get("password") || undefined;
  return {
    offer: {
      v: 2,
      serverId,
      daemonPublicKeyB64: key,
      relay: { endpoint, useTls: params.get("ssl") === "true" },
    },
    ...(password ? { password } : {}),
  };
}

export function serializeRelayConnectionUri(parts: ParsedRelayConnectionUri): string {
  const url = new URL(
    `relay://${parts.offer.relay.endpoint}/${encodeURIComponent(parts.offer.serverId)}`,
  );
  url.searchParams.set("key", parts.offer.daemonPublicKeyB64);
  if (parts.offer.relay.useTls) url.searchParams.set("ssl", "true");
  if (parts.password) url.searchParams.set("password", parts.password);
  return url.toString();
}

export type RelayRole = "server" | "client";
export type RelayProtocolVersion = "1" | "2";

export const CURRENT_RELAY_PROTOCOL_VERSION: RelayProtocolVersion = "2";
export const DEFAULT_RELAY_ENDPOINT = "relay.paseo.sh:443";
// The production Cloudflare cutover bridge streams WebSocket traffic through
// fetch(). Sustained client uploads can reset that proxy while the same relay
// service remains healthy when clients connect to its Fly upstream directly.
// Keep daemon sockets on the public endpoint, but route clients around the
// lossy bridge until it can preserve WebSocket backpressure.
export const DEFAULT_HOSTED_RELAY_CLIENT_ENDPOINT = "paseo-relay-next.fly.dev:443";

export function normalizeRelayProtocolVersion(
  value: unknown,
  fallback: RelayProtocolVersion = CURRENT_RELAY_PROTOCOL_VERSION,
): RelayProtocolVersion {
  if (value == null) {
    return fallback;
  }

  let normalized = "";
  if (typeof value === "string") {
    normalized = value.trim();
  } else if (typeof value === "number") {
    normalized = String(value);
  }
  if (!normalized) {
    return fallback;
  }
  if (normalized === "1" || normalized === "2") {
    return normalized;
  }
  throw new Error('Relay version must be "1" or "2"');
}

function parsePort(portStr: string, context: string): number {
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${context}: port must be between 1 and 65535`);
  }
  return port;
}

export function parseHostPort(input: string): HostPortParts {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Host is required");
  }

  // IPv6: [::1]:6767
  if (trimmed.startsWith("[")) {
    const match = trimmed.match(/^\[([^\]]+)\]:(\d{1,5})$/);
    if (!match) {
      throw new Error("Invalid host:port (expected [::1]:6767)");
    }
    const host = match[1].trim();
    if (!host) throw new Error("Host is required");
    const port = parsePort(match[2], "Invalid host:port");
    return { host, port, isIpv6: true };
  }

  const match = trimmed.match(/^(.+):(\d{1,5})$/);
  if (!match) {
    throw new Error("Invalid host:port (expected localhost:6767)");
  }
  const host = match[1].trim();
  if (!host) throw new Error("Host is required");
  const port = parsePort(match[2], "Invalid host:port");
  return { host, port, isIpv6: false };
}

export function normalizeHostPort(input: string): string {
  const { host, port, isIpv6 } = parseHostPort(input);
  return isIpv6 ? `[${host}]:${port}` : `${host}:${port}`;
}

export function parseConnectionUri(input: string): ParsedConnectionUri {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Connection URI is required");
  }

  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(trimmed);
  if (!match) {
    throw new Error("Invalid connection URI");
  }

  if (match[1].toLowerCase() !== "tcp") {
    throw new Error("Connection URI protocol must be tcp:");
  }

  const remainder = match[2];
  const authorityEnd = remainder.search(/[/?#]/);
  const authority = (authorityEnd < 0 ? remainder : remainder.slice(0, authorityEnd)).trim();
  if (authority.includes("@")) {
    throw new Error("Connection URI userinfo is not supported");
  }
  if (!authority) {
    throw new Error("Connection URI host is required");
  }

  let host: string;
  let portText: string;
  let isIpv6: boolean;
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    if (closingBracket < 0) {
      throw new Error("Invalid connection URI");
    }
    host = authority.slice(1, closingBracket).trim();
    const portPart = authority.slice(closingBracket + 1);
    if (!portPart.startsWith(":")) {
      throw new Error("Connection URI port is required");
    }
    portText = portPart.slice(1).trim();
    isIpv6 = true;
  } else {
    const separator = authority.lastIndexOf(":");
    if (separator < 0) {
      throw new Error("Connection URI port is required");
    }
    host = authority.slice(0, separator).trim();
    portText = authority.slice(separator + 1).trim();
    isIpv6 = false;
  }
  if (!host) {
    throw new Error("Connection URI host is required");
  }
  if (!portText) {
    throw new Error("Connection URI port is required");
  }

  const hashIndex = remainder.indexOf("#");
  const withoutHash = hashIndex < 0 ? remainder : remainder.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const params = new URLSearchParams(queryIndex < 0 ? "" : withoutHash.slice(queryIndex + 1));
  const password = params.get("password") || undefined;

  return {
    host,
    port: parsePort(portText, "Invalid connection URI"),
    isIpv6,
    useTls: params.get("ssl") === "true",
    ...(password ? { password } : {}),
  };
}

export function serializeConnectionUri(parts: ConnectionUriParts): string {
  return serializeConnectionUriParts(parts, false);
}

export function serializeConnectionUriForStorage(parts: ParsedConnectionUri): string {
  return serializeConnectionUriParts(parts, true);
}

function serializeConnectionUriParts(
  parts: ConnectionUriParts & { password?: string },
  includePassword: boolean,
): string {
  const hostPart = parts.isIpv6 ? `[${parts.host}]` : parts.host;
  const params = new URLSearchParams();
  if (parts.useTls) {
    params.set("ssl", "true");
  }
  if (includePassword && parts.password) {
    params.set("password", parts.password);
  }
  const query = params.toString();
  return `tcp://${hostPart}:${parts.port}${query ? `?${query}` : ""}`;
}

export function normalizeLoopbackToLocalhost(endpoint: string): string {
  const { host, port, isIpv6 } = parseHostPort(endpoint);
  if (host === "127.0.0.1" || (!isIpv6 && host === "0.0.0.0")) {
    return `localhost:${port}`;
  }
  if (isIpv6 && (host === "::1" || host === "::")) {
    return `localhost:${port}`;
  }
  return endpoint;
}

export function deriveLabelFromEndpoint(endpoint: string): string {
  try {
    const { host } = parseHostPort(endpoint);
    return host || "Unnamed Host";
  } catch {
    return "Unnamed Host";
  }
}

export interface WebSocketUrlOptions {
  useTls: boolean;
}

export function buildDaemonWebSocketUrl(endpoint: string, opts: WebSocketUrlOptions): string {
  const { host, port, isIpv6 } = parseHostPort(endpoint);
  const protocol = opts.useTls ? "wss" : "ws";
  const hostPart = isIpv6 ? `[${host}]` : host;
  return new URL(`${protocol}://${hostPart}:${port}/ws`).toString();
}

export function buildRelayWebSocketUrl(params: {
  endpoint: string;
  useTls: boolean;
  serverId: string;
  role: RelayRole;
  /**
   * Per-connection routing identifier used by the daemon to open server data sockets.
   * Clients should NOT provide this — the relay assigns a routing ID on connect.
   */
  connectionId?: string;
  version?: RelayProtocolVersion | 1 | 2;
}): string {
  let { host, port, isIpv6 } = parseHostPort(params.endpoint);
  if (params.role === "client" && params.useTls && host === "relay.paseo.sh" && port === 443) {
    ({ host, port, isIpv6 } = parseHostPort(DEFAULT_HOSTED_RELAY_CLIENT_ENDPOINT));
  }
  const protocol = params.useTls ? "wss" : "ws";
  const hostPart = isIpv6 ? `[${host}]` : host;
  const url = new URL(`${protocol}://${hostPart}:${port}/ws`);
  url.searchParams.set("serverId", params.serverId);
  url.searchParams.set("role", params.role);
  url.searchParams.set("v", normalizeRelayProtocolVersion(params.version));
  if (params.connectionId) {
    url.searchParams.set("connectionId", params.connectionId);
  }
  return url.toString();
}

/**
 * @deprecated Migration fallback for stored relay connections/offers that predate
 * explicit relay useTls. Delete after two release cycles.
 */
export function shouldUseTlsForDefaultHostedRelay(endpoint: string): boolean {
  try {
    const { port } = parseHostPort(endpoint);
    return port === 443;
  } catch {
    return false;
  }
}

export function extractHostPortFromWebSocketUrl(wsUrl: string): string {
  const parsed = new URL(wsUrl);
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("Invalid WebSocket URL protocol");
  }
  if (parsed.pathname.replace(/\/+$/, "") !== "/ws") {
    throw new Error("Invalid WebSocket URL (expected /ws path)");
  }

  const host = parsed.hostname;
  let port: number;
  if (parsed.port) {
    port = Number(parsed.port);
  } else if (parsed.protocol === "wss:") {
    port = 443;
  } else {
    port = 80;
  }
  if (!host) {
    throw new Error("Invalid WebSocket URL (missing hostname)");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid WebSocket URL (invalid port)");
  }

  const isIpv6 = host.includes(":") && !host.startsWith("[") && !host.endsWith("]");
  return isIpv6 ? `[${host}]:${port}` : `${host}:${port}`;
}

export function isRelayClientWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("role") === "client" && parsed.searchParams.has("serverId");
  } catch {
    return false;
  }
}
