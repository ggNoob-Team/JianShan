/**
 * The HarmonyOS app is a web shell, so platform constants report a browser.
 * The clipboard bridge is injected by the shell and marks a mobile device that
 * still needs touch-first affordances such as an always-visible attachment
 * remove button.
 */
export function isHarmonyShell(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const shell = window as unknown as {
    paseoClipboard?: { writeText?: unknown };
  };
  return typeof shell.paseoClipboard?.writeText === "function";
}
