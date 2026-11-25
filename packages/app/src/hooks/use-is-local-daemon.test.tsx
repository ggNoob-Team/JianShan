/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostConnection, HostProfile } from "@/types/host-connection";

const mocks = vi.hoisted(() => ({
  isDesktopApp: true,
  hosts: [] as HostProfile[],
  desktopServerId: "",
  getDesktopDaemonStatus: vi.fn(async () => ({ serverId: mocks.desktopServerId })),
}));

vi.mock("@/desktop/daemon/desktop-daemon", () => ({
  shouldUseDesktopDaemon: () => mocks.isDesktopApp,
  getDesktopDaemonStatus: mocks.getDesktopDaemonStatus,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => mocks.hosts,
}));

import { useLocalDaemonServerId, useLocalDaemonServerIdState } from "./use-is-local-daemon";

function host(serverId: string, connection: HostConnection): HostProfile {
  return {
    serverId,
    label: serverId,
    appearance: { color: "none", badgeDisplay: null },
    lifecycle: {},
    connections: [connection],
    preferredConnectionId: connection.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useLocalDaemonServerId", () => {
  afterEach(() => {
    mocks.isDesktopApp = true;
    mocks.hosts = [];
    mocks.desktopServerId = "";
    vi.clearAllMocks();
  });

  it("resolves a manually added loopback host when the built-in daemon is disabled", async () => {
    mocks.hosts = [
      host("srv_remote", {
        id: "direct:45.40.254.22:4100",
        type: "directTcp",
        endpoint: "45.40.254.22:4100",
      }),
      host("srv_local", {
        id: "direct:localhost:6767",
        type: "directTcp",
        endpoint: "localhost:6767",
      }),
    ];

    const { result } = renderHook(() => useLocalDaemonServerId(), { wrapper });

    await waitFor(() => expect(result.current).toBe("srv_local"));
  });

  it("keeps the desktop daemon status as a fallback before its host is registered", async () => {
    mocks.desktopServerId = "srv_built_in";
    mocks.hosts = [
      host("srv_remote", {
        id: "direct:remote.example:6767",
        type: "directTcp",
        endpoint: "remote.example:6767",
      }),
    ];

    const { result } = renderHook(() => useLocalDaemonServerId(), { wrapper });

    await waitFor(() => expect(result.current).toBe("srv_built_in"));
  });

  it("reports the same manually added local host through the state hook", async () => {
    mocks.hosts = [
      host("srv_local", {
        id: "pipe:/tmp/paseo.sock",
        type: "directPipe",
        path: "/tmp/paseo.sock",
      }),
    ];

    const { result } = renderHook(() => useLocalDaemonServerIdState(), { wrapper });

    await waitFor(() =>
      expect(result.current).toEqual({ status: "resolved", serverId: "srv_local" }),
    );
  });

  it("does not identify a local host outside the desktop app", async () => {
    mocks.isDesktopApp = false;
    mocks.hosts = [
      host("srv_local", {
        id: "direct:127.0.0.1:6767",
        type: "directTcp",
        endpoint: "127.0.0.1:6767",
      }),
    ];

    const { result } = renderHook(() => useLocalDaemonServerId(), { wrapper });

    expect(result.current).toBeNull();
  });
});
