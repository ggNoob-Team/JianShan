/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOOP = () => undefined;

const mocks = vi.hoisted(() => ({
  getDaemonPairingOffer: vi.fn(),
  patchConfig: vi.fn(),
  snapshot: { connectionStatus: "online" } as { connectionStatus: string },
  client: null as null | {
    getLastServerInfoMessage: () => {
      features: { daemonStatusRpc: boolean; relayConfig: boolean };
    };
    getDaemonPairingOffer: (options?: { clientName?: string }) => Promise<unknown>;
  },
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => mocks.client,
  useHostRuntimeSnapshot: () => mocks.snapshot,
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({ patchConfig: mocks.patchConfig }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key.replaceAll("{{name}}", values?.name ?? ""),
  }),
}));

vi.mock("@/components/ui/form-field", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  return {
    Field: ({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) =>
      ReactModule.createElement(
        "label",
        null,
        ReactModule.createElement("span", null, label),
        children,
        hint ? ReactModule.createElement("span", null, hint) : null,
      ),
    FormTextInput: ReactModule.forwardRef(
      (
        props: {
          initialValue?: string;
          onChangeText?: (value: string) => void;
          onSubmitEditing?: () => void;
          accessibilityLabel?: string;
          testID?: string;
          maxLength?: number;
          editable?: boolean;
        },
        ref,
      ) => {
        const inputRef = ReactModule.useRef<HTMLInputElement | null>(null);
        ReactModule.useImperativeHandle(ref, () => ({
          focus: () => inputRef.current?.focus(),
          blur: () => inputRef.current?.blur(),
          isFocused: () => document.activeElement === inputRef.current,
          getText: () => inputRef.current?.value ?? "",
          replaceText: (value: string) => {
            if (inputRef.current) inputRef.current.value = value;
            props.onChangeText?.(value);
          },
          setSelection: () => undefined,
          reset: () => {
            if (inputRef.current) inputRef.current.value = "";
          },
          getNativeRef: () => inputRef.current,
        }));
        return ReactModule.createElement("input", {
          ref: inputRef,
          defaultValue: props.initialValue ?? "",
          "aria-label": props.accessibilityLabel,
          "data-testid": props.testID,
          disabled: props.editable === false,
          maxLength: props.maxLength,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            props.onChangeText?.(event.target.value),
          onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") props.onSubmitEditing?.();
          },
        });
      },
    ),
  };
});

vi.mock("@/components/ui/button", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  return {
    Button: ({
      children,
      disabled,
      loading: _loading,
      onPress,
      testID,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      disabled?: boolean;
      loading?: boolean;
      onPress?: () => void;
      testID?: string;
      accessibilityLabel?: string;
    }) =>
      ReactModule.createElement(
        "button",
        {
          type: "button",
          disabled,
          "aria-label": accessibilityLabel,
          "data-testid": testID,
          onClick: onPress,
        },
        children,
      ),
  };
});

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ description }: { description?: string }) => <div role="alert">{description}</div>,
}));

vi.mock("@/components/ui/external-link", () => ({
  ExternalLink: () => null,
}));

vi.mock("@/components/ui/loading-spinner", () => ({
  LoadingSpinner: () => <span data-testid="loading-spinner" />,
}));

vi.mock("lucide-react-native", () => {
  const Icon = () => null;
  return {
    Check: Icon,
    Copy: Icon,
    Network: Icon,
    RotateCw: Icon,
    ShieldCheck: Icon,
  };
});

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => undefined),
}));

vi.mock("qrcode", () => ({
  toString: vi.fn(async () => "<svg />"),
}));

import { PairDeviceSection } from "./pair-device-section";

function createClient() {
  return {
    getLastServerInfoMessage: () => ({
      features: { daemonStatusRpc: true, relayConfig: true },
    }),
    getDaemonPairingOffer: mocks.getDaemonPairingOffer,
  };
}

function renderSection(visible = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const element = (nextVisible: boolean) => (
    <QueryClientProvider client={queryClient}>
      <PairDeviceSection serverId="host-a" visible={nextVisible} onClose={NOOP} />
    </QueryClientProvider>
  );
  const result = render(element(visible));
  return {
    ...result,
    rerenderVisible: (nextVisible: boolean) => result.rerender(element(nextVisible)),
  };
}

describe("PairDeviceSection", () => {
  beforeEach(() => {
    mocks.client = createClient();
    mocks.snapshot = { connectionStatus: "online" };
    mocks.getDaemonPairingOffer.mockResolvedValue({
      relayEnabled: true,
      url: "https://app.example/#offer=pairing",
      qr: null,
      clientName: "手机端角色",
      role: "member",
    });
    mocks.patchConfig.mockResolvedValue({ relay: { enabled: true } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("requires a role name before requesting or showing the pairing offer", async () => {
    renderSection();

    const input = screen.getByTestId("pair-device-role-name-input");
    const submit = screen.getByTestId("pair-device-role-name-submit");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.getDaemonPairingOffer).not.toHaveBeenCalled();
    expect(screen.queryByText("pairing.device.hint")).toBeNull();

    fireEvent.change(input, { target: { value: "  手机端角色  " } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() =>
      expect(mocks.getDaemonPairingOffer).toHaveBeenCalledWith({ clientName: "手机端角色" }),
    );
    expect(await screen.findByText("pairing.device.hint")).toBeDefined();
  });

  it("does not submit a whitespace-only role name", () => {
    renderSection();

    fireEvent.change(screen.getByTestId("pair-device-role-name-input"), {
      target: { value: "   " },
    });

    expect((screen.getByTestId("pair-device-role-name-submit") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(mocks.getDaemonPairingOffer).not.toHaveBeenCalled();
  });

  it("keeps the role name when enabling relay and regenerating the offer", async () => {
    mocks.getDaemonPairingOffer
      .mockResolvedValueOnce({ relayEnabled: false, url: "", qr: null, role: "member" })
      .mockResolvedValueOnce({
        relayEnabled: true,
        url: "https://app.example/#offer=pairing",
        qr: null,
        clientName: "手机端角色",
        role: "member",
      });
    renderSection();

    fireEvent.change(screen.getByTestId("pair-device-role-name-input"), {
      target: { value: "手机端角色" },
    });
    fireEvent.click(screen.getByTestId("pair-device-role-name-submit"));

    await screen.findByText("pairing.device.enableTitle");
    fireEvent.click(screen.getByRole("button", { name: "pairing.device.enableRelay" }));

    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({ relay: { enabled: true } }),
    );
    await waitFor(() => expect(mocks.getDaemonPairingOffer).toHaveBeenCalledTimes(2));
    expect(mocks.getDaemonPairingOffer).toHaveBeenLastCalledWith({ clientName: "手机端角色" });
    expect(await screen.findByText("pairing.device.hint")).toBeDefined();
  });

  it("clears the role name when the modal closes", () => {
    const rendered = renderSection();
    const input = screen.getByTestId("pair-device-role-name-input");
    fireEvent.change(input, { target: { value: "手机端角色" } });
    expect((input as HTMLInputElement).value).toBe("手机端角色");

    rendered.rerenderVisible(false);

    expect((screen.getByTestId("pair-device-role-name-input") as HTMLInputElement).value).toBe("");
  });
});
