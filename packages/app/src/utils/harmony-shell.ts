/**
 * The HarmonyOS app is a web shell, so platform constants report a browser.
 * The shell bridges mark a mobile device that still needs touch-first
 * affordances such as an always-visible attachment remove button.
 */
export function isHarmonyShell(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const shell = window as unknown as {
    paseoClipboard?: { writeText?: unknown };
    paseoPhotoPicker?: { pickImages?: unknown };
  };
  return (
    typeof shell.paseoPhotoPicker?.pickImages === "function" ||
    typeof shell.paseoClipboard?.writeText === "function"
  );
}

/**
 * HarmonyOS runs the Expo web build, so `isWeb` is true. The web camera path can
 * still scan a pairing QR when ArkWeb exposes camera capture; expo-camera
 * supplies the barcode decoder.
 */
export function hasHarmonyQrScanner(): boolean {
  if (!isHarmonyShell() || typeof navigator === "undefined") {
    return false;
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return false;
  }
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}
