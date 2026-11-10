import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ensureAdminKey, rotateAdminKey } from "./admin-control.js";
import { startAdminServer } from "./admin-server.js";

vi.mock("./admin-daemon.js", () => ({
  withAdminDaemonClient: async (
    _paseoHome: string,
    action: (client: {
      getDaemonConfig: () => Promise<{ config: Record<string, unknown> }>;
      getDaemonPairingOffer: () => Promise<{ relayEnabled: boolean; url: string }>;
      reloadDaemonConfig: () => Promise<{
        appliedPaths: string[];
        restartRequiredPaths: string[];
        overrideControlledPaths: string[];
      }>;
    }) => Promise<unknown>,
  ) =>
    action({
      getDaemonConfig: async () => ({
        config: {
          relay: { enabled: true },
          mcp: { enabled: true, injectIntoAgents: true },
          browserTools: { enabled: false },
          cors: { allowedOrigins: ["https://paseo-app-8wq.pages.dev"] },
          app: { baseUrl: "https://paseo-app-8wq.pages.dev" },
        },
      }),
      getDaemonPairingOffer: async () => ({
        relayEnabled: true,
        url: "https://app.paseo.sh/#offer=test",
      }),
      reloadDaemonConfig: async () => ({
        appliedPaths: ["app.baseUrl"],
        restartRequiredPaths: [],
        overrideControlledPaths: [],
      }),
    }),
}));

const directories: string[] = [];
const handles: Array<Awaited<ReturnType<typeof startAdminServer>>> = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("admin server", () => {
  test("serves the new console and requires the generated key", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-server-"));
    directories.push(home);
    const key = await ensureAdminKey(home);
    const handle = await startAdminServer({
      paseoHome: home,
      listen: { host: "127.0.0.1", port: 0 },
    });
    handles.push(handle);

    const page = await fetch(handle.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("见山管理台");

    const unauthorized = await fetch(new URL("/api/roles", handle.url));
    expect(unauthorized.status).toBe(401);

    const login = await fetch(new URL("/api/session", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toBeNull();

    const authorized = await fetch(new URL("/api/roles", handle.url), {
      headers: { Cookie: cookie!.split(";")[0]! },
    });
    expect(authorized.status).toBe(200);

    await rotateAdminKey(home);
    const rotated = await fetch(new URL("/api/roles", handle.url), {
      headers: { Cookie: cookie!.split(";")[0]! },
    });
    expect(rotated.status).toBe(401);
  });

  test("returns a browser-renderable QR image for a new role", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-server-"));
    directories.push(home);
    const key = await ensureAdminKey(home);
    const handle = await startAdminServer({
      paseoHome: home,
      listen: { host: "127.0.0.1", port: 0 },
    });
    handles.push(handle);

    const login = await fetch(new URL("/api/session", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const response = await fetch(new URL("/api/roles", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "八哥" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { qr: string; url: string };
    expect(body.url).toBe("https://app.paseo.sh/#offer=test");
    expect(body.qr).toMatch(/^data:image\/png;base64,/);
  });

  test("reads and saves the non-sensitive daemon config", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-server-"));
    directories.push(home);
    const key = await ensureAdminKey(home);
    const handle = await startAdminServer({
      paseoHome: home,
      listen: { host: "127.0.0.1", port: 0 },
    });
    handles.push(handle);
    const login = await fetch(new URL("/api/session", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;

    const current = await fetch(new URL("/api/settings", handle.url), {
      headers: { Cookie: cookie },
    });
    expect(current.status).toBe(200);
    const body = (await current.json()) as {
      config: Record<string, unknown>;
      runtimeConfig: unknown;
    };
    expect(body.runtimeConfig).toMatchObject({
      daemon: {
        relay: { enabled: true },
        mcp: { enabled: true, injectIntoAgents: true },
      },
    });
    const saved = await fetch(new URL("/api/settings", handle.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        config: {
          ...body.config,
          app: { baseUrl: "https://example.test" },
        },
      }),
    });

    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({
      ok: true,
      config: { app: { baseUrl: "https://example.test" } },
      runtimeConfig: { daemon: { relay: { enabled: true } } },
      reload: { appliedPaths: ["app.baseUrl"] },
    });

    const retry = await fetch(new URL("/api/settings/reload", handle.url), {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      ok: true,
      reload: { appliedPaths: ["app.baseUrl"] },
      runtimeConfig: { daemon: { mcp: { enabled: true } } },
    });
  });

  test("resets the admin key and invalidates existing sessions", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-server-"));
    directories.push(home);
    const key = await ensureAdminKey(home);
    expect(key).toBe("123456");
    const handle = await startAdminServer({
      paseoHome: home,
      listen: { host: "127.0.0.1", port: 0 },
    });
    handles.push(handle);
    const login = await fetch(new URL("/api/session", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;

    const reset = await fetch(new URL("/api/settings/admin-key", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ key: "new-local-key" }),
    });
    expect(reset.status).toBe(200);

    const expired = await fetch(new URL("/api/settings", handle.url), {
      headers: { Cookie: cookie },
    });
    expect(expired.status).toBe(401);
    const oldLogin = await fetch(new URL("/api/session", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await fetch(new URL("/api/session", handle.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "new-local-key" }),
    });
    expect(newLogin.status).toBe(200);
  });
});
