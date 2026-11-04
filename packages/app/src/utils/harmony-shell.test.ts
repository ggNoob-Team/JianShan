/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { hasHarmonyQrScanner, isHarmonyShell } from "./harmony-shell";

function setMediaDevices(value: unknown): void {
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value,
  });
}

function setSecureContext(value: boolean | undefined): void {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  delete (window as unknown as { paseoClipboard?: unknown }).paseoClipboard;
  delete (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker;
  setMediaDevices(undefined);
  setSecureContext(undefined);
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

describe("hasHarmonyQrScanner", () => {
  it("enables scanning when the shell exposes camera capture", () => {
    (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker = {
      pickImages: () => undefined,
    };
    setMediaDevices({ getUserMedia: async () => ({}) as MediaStream });
    expect(hasHarmonyQrScanner()).toBe(true);
  });

  it("requires the Harmony shell", () => {
    setMediaDevices({ getUserMedia: async () => ({}) as MediaStream });
    expect(hasHarmonyQrScanner()).toBe(false);
  });

  it("requires camera capture", () => {
    (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker = {
      pickImages: () => undefined,
    };
    expect(hasHarmonyQrScanner()).toBe(false);
  });

  it("rejects an insecure context", () => {
    (window as unknown as { paseoPhotoPicker?: unknown }).paseoPhotoPicker = {
      pickImages: () => undefined,
    };
    setMediaDevices({ getUserMedia: async () => ({}) as MediaStream });
    setSecureContext(false);
    expect(hasHarmonyQrScanner()).toBe(false);
  });
});
