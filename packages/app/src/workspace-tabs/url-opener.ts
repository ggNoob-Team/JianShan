interface WorkspaceUrlOpener {
  workspaceKey: string;
  openUrl: (url: string) => boolean;
}

let activeOpener: WorkspaceUrlOpener | null = null;

/**
 * Lets the app-wide link opener reach the active workspace without threading a
 * callback through every note, chat, and pull-request surface.
 */
export function registerWorkspaceUrlOpener(input: WorkspaceUrlOpener): () => void {
  const registration = { ...input };
  activeOpener = registration;
  return () => {
    if (activeOpener === registration) {
      activeOpener = null;
    }
  };
}

export function openUrlInWorkspaceTab(url: string): boolean {
  const opener = activeOpener;
  if (!opener) {
    return false;
  }
  try {
    return opener.openUrl(url);
  } catch (error) {
    console.error("[workspace-url-opener] Failed to open link in a workspace tab:", error);
    return false;
  }
}
