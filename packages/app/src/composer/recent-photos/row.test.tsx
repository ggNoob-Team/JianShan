/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { View } from "react-native";
import { MenuContextProvider, type MenuContextValue } from "@/components/ui/menu/menu-context";
import { RecentPhotosRow } from "./row";

vi.mock("./use-recent-photos", () => ({
  useRecentPhotos: () => ({
    photos: [
      {
        assetId: "asset-1",
        previewUri: "data:image/jpeg;base64,AA==",
        fileName: "IMG_1.jpg",
        mimeType: "image/jpeg",
      },
    ],
    isLoading: false,
    hasLoaded: true,
  }),
}));

function menuContext(overrides: Partial<MenuContextValue> = {}): MenuContextValue {
  return {
    open: true,
    setOpen: vi.fn(),
    selectItem: vi.fn((action: (() => void) | undefined) => action?.()),
    triggerRef: { current: null as View | null },
    anchorRect: null,
    setAnchorRect: vi.fn(),
    presentation: "popover",
    path: [],
    revision: 0,
    bumpRevision: vi.fn(),
    openSub: vi.fn(),
    closeSub: vi.fn(),
    goBack: vi.fn(),
    ...overrides,
  };
}

describe("RecentPhotosRow", () => {
  it("adds a photo without closing the attachment menu", () => {
    const onSelect = vi.fn();
    const context = menuContext();

    render(
      <MenuContextProvider value={context}>
        <RecentPhotosRow onSelect={onSelect} />
      </MenuContextProvider>,
    );

    fireEvent.click(screen.getByTestId("composer-recent-photo-asset-1"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(context.selectItem).toHaveBeenCalledWith(expect.any(Function), false);
  });
});
