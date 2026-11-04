/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { isHarmonyShell } from "./harmony-shell";

afterEach(() => {
  delete (window as unknown as { paseoClipboard?: unknown }).paseoClipboard;
  delete (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker;
});

describe("isHarmonyShell", () => {
  it("detects the HarmonyOS photo picker bridge", () => {
    (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker = {
      pickImages: () => undefined,
    };
    expect(isHarmonyShell()).toBe(true);
  });

  it("keeps detecting the clipboard bridge", () => {
    (window as unknown as { paseoClipboard?: unknown }).paseoClipboard = {
      writeText: () => undefined,
    };
    expect(isHarmonyShell()).toBe(true);
  });

  it("is false for a plain browser", () => {
    expect(isHarmonyShell()).toBe(false);
  });
});
