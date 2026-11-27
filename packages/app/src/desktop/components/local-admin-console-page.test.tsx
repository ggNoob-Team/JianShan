/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminUrl: "http://127.0.0.1:6769/" as string | null,
  openExternalUrl: vi.fn(async () => undefined),
  reportUrl: null as null | ((url: string) => void),
}));

vi.mock("@/desktop/hooks/use-daemon-status", () => ({
  useDaemonStatus: () => ({
    data: mocks.adminUrl ? { status: { adminUrl: mocks.adminUrl } } : null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/desktop/components/local-admin-console-webview", () => ({
  LocalAdminConsoleWebview: ({ onUrlChange }: { onUrlChange: (url: string) => void }) => {
    mocks.reportUrl = onUrlChange;
    return <div data-testid="local-admin-console-webview" />;
  },
}));

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

vi.mock("@/components/headers/menu-header", () => ({
  MenuHeader: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onPress,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { LocalAdminConsolePage } from "./local-admin-console-page";

describe("LocalAdminConsolePage", () => {
  beforeEach(() => {
    mocks.adminUrl = "http://127.0.0.1:6769/";
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.reportUrl = null;
  });

  it("shows the admin address and opens the current page in the system browser", async () => {
    render(<LocalAdminConsolePage />);

    expect(screen.getByText("http://127.0.0.1:6769/")).toBeDefined();
    expect(screen.getByTestId("local-admin-console-webview")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "desktop.daemon.admin.browserOpen" }));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith("http://127.0.0.1:6769/");
  });

  it("uses the webview's current URL for external opening", () => {
    render(<LocalAdminConsolePage />);
    act(() => mocks.reportUrl?.("http://127.0.0.1:6769/team"));

    expect(screen.getByText("http://127.0.0.1:6769/team")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "desktop.daemon.admin.browserOpen" }));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith("http://127.0.0.1:6769/team");
  });

  it("disables browser opening when the admin console is unavailable", () => {
    mocks.adminUrl = null;
    render(<LocalAdminConsolePage />);

    expect(
      (
        screen.getByRole("button", {
          name: "desktop.daemon.admin.browserOpen",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
