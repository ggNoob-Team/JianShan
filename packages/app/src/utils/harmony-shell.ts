/**
 * The HarmonyOS app is a web shell, so platform constants report a browser.
 * These bridges are injected by the shell and mark a mobile device that still
 * needs touch-first affordances such as an always-visible attachment remove
 * button.
 */
export function isHarmonyShell(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const shell = window as unknown as {
    paseoClipboard?: { writeText?: unknown };
    paseoPhotoLibrary?: { getRecentPhotos?: unknown };
  };
  return (
    typeof shell.paseoClipboard?.writeText === "function" ||
    typeof shell.paseoPhotoLibrary?.getRecentPhotos === "function"
  );
}
