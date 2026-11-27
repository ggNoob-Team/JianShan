/**
 * @vitest-environment jsdom
 */

/* oxlint-disable react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-function-as-prop -- test fixtures */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHostAppearance } from "@/hosts/appearance";
import type { HostProfile } from "@/types/host-connection";

const mocks = vi.hoisted(() => ({
  setRemoteLocalHostAccess: vi.fn(async () => undefined),
  patchConfig: vi.fn(async () => ({ relay: { enabled: true } })),
  relayEnabled: false,
  configLoading: false,
  localServerId: "srv_local" as string | null,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeIsConnected: () => true,
  useHostRuntimeClient: () => ({
    getLastServerInfoMessage: () => ({ features: { relayConfig: true } }),
  }),
  useHostMutations: () => ({ setRemoteLocalHostAccess: mocks.setRemoteLocalHostAccess }),
}));

vi.mock("@/hooks/use-is-local-daemon", () => ({
  useLocalDaemonServerId: () => mocks.localServerId,
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({
    config: { relay: { enabled: mocks.relayEnabled } },
    isLoading: mocks.configLoading,
    patchConfig: mocks.patchConfig,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key.replaceAll("{{value}}", values?.value ?? ""),
  }),
}));

vi.mock("@/components/adaptive-modal-sheet", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  return {
    AdaptiveModalSheet: ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
      visible ? ReactModule.createElement("div", { role: "dialog" }, children) : null,
  };
});

vi.mock("@/components/settings/headings/settings-section", () => ({
  SettingsSection: ({ title, children }: { title: string; children?: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    disabled,
    onValueChange,
    testID,
  }: {
    value: boolean;
    disabled?: boolean;
    onValueChange: (value: boolean) => void;
    testID?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      data-testid={testID}
      onClick={() => onValueChange(!value)}
    />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ description }: { description?: string }) => <div role="alert">{description}</div>,
}));

vi.mock("@/components/ui/external-link", () => ({
  ExternalLink: () => null,
}));

vi.mock("lucide-react-native", () => {
  const Icon = () => null;
  return { Network: Icon, ShieldCheck: Icon };
});

import { RemoteLocalHostAccessCard } from "./remote-local-host-access-card";

const HOST: HostProfile = {
  serverId: "srv_remote",
  label: "Remote",
  appearance: defaultHostAppearance(),
  lifecycle: {},
  remoteLocalHost: { enabled: false, localServerId: "srv_local" },
  connections: [
    {
      id: "direct:remote:6767",
      type: "directTcp",
      endpoint: "remote.example:6767",
    },
  ],
  preferredConnectionId: "direct:remote:6767",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("RemoteLocalHostAccessCard", () => {
  beforeEach(() => {
    mocks.relayEnabled = false;
    mocks.configLoading = false;
    mocks.localServerId = "srv_local";
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("prompts for relay before enabling remote local-host access", async () => {
    render(<RemoteLocalHostAccessCard host={HOST} />);

    fireEvent.click(screen.getByTestId("host-page-remote-local-host-switch"));

    expect(mocks.setRemoteLocalHostAccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("pairing.device.enableTitle")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "pairing.device.enableRelay" }));

    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({ relay: { enabled: true } }),
    );
    await waitFor(() =>
      expect(mocks.setRemoteLocalHostAccess).toHaveBeenCalledWith("srv_remote", true),
    );
  });

  it("enables the switch directly when the local relay is already on", async () => {
    mocks.relayEnabled = true;
    render(<RemoteLocalHostAccessCard host={HOST} />);

    fireEvent.click(screen.getByTestId("host-page-remote-local-host-switch"));

    await waitFor(() =>
      expect(mocks.setRemoteLocalHostAccess).toHaveBeenCalledWith("srv_remote", true),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves access disabled when the relay prompt is cancelled", () => {
    render(<RemoteLocalHostAccessCard host={HOST} />);

    fireEvent.click(screen.getByTestId("host-page-remote-local-host-switch"));
    fireEvent.click(screen.getByRole("button", { name: "pairing.device.notNow" }));

    expect(mocks.patchConfig).not.toHaveBeenCalled();
    expect(mocks.setRemoteLocalHostAccess).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables access directly without asking about relay", async () => {
    render(
      <RemoteLocalHostAccessCard
        host={{
          ...HOST,
          remoteLocalHost: { enabled: true, localServerId: "srv_local" },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("host-page-remote-local-host-switch"));

    await waitFor(() =>
      expect(mocks.setRemoteLocalHostAccess).toHaveBeenCalledWith("srv_remote", false),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
