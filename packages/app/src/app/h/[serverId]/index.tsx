import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useHostRouteServerId } from "@/navigation/host-route-context";
import {
  resolveHostIndexRoute,
  resolveWorkspaceSelectionStatus,
} from "@/navigation/host-runtime-bootstrap";
import { useAppSettings } from "@/hooks/use-settings";
import {
  consumeQuickInputLaunch,
  hasQuickInputLaunchBeenConsumed,
} from "@/quick-input/launch-gate";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import {
  useHasHydratedWorkspaces,
  useHasWorkspaces,
  useWorkspaceExists,
} from "@/stores/session-store-hooks";
import {
  useIsLastWorkspaceSelectionHydrated,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";

// Workspace hydration needs a live daemon. Without a bound, an offline host
// (or a settings load that never settles) pins the splash forever.
const STARTUP_DATA_GRACE_MS = 2_000;

export default function HostIndexRoute() {
  const serverId = useHostRouteServerId();
  const { settings, isLoading: settingsLoading } = useAppSettings();
  const workspaceSelection = useLastWorkspaceSelection();
  const isWorkspaceSelectionLoaded = useIsLastWorkspaceSelectionHydrated();
  const workspaceSelectionWorkspaceId =
    workspaceSelection?.serverId === serverId ? workspaceSelection.workspaceId : null;
  const hasHydratedWorkspaces = useHasHydratedWorkspaces(serverId);
  const hasWorkspaces = useHasWorkspaces(serverId);
  const workspaceSelectionExists = useWorkspaceExists(serverId, workspaceSelectionWorkspaceId);
  const workspaceSelectionStatus = resolveWorkspaceSelectionStatus({
    hasHydratedWorkspaces,
    workspaceExists: workspaceSelectionExists,
  });
  const [startupGraceElapsed, setStartupGraceElapsed] = useState(false);
  useEffect(() => {
    const handle = setTimeout(() => setStartupGraceElapsed(true), STARTUP_DATA_GRACE_MS);
    return () => clearTimeout(handle);
  }, []);

  const waitingForStartupData =
    settingsLoading || (workspaceSelectionWorkspaceId !== null && !hasHydratedWorkspaces);
  const launchConsumed = hasQuickInputLaunchBeenConsumed();
  const routingToQuickInput =
    settings.quickInputEnabled &&
    !launchConsumed &&
    hasWorkspaces &&
    workspaceSelectionWorkspaceId !== null &&
    workspaceSelectionStatus !== "missing";

  useEffect(() => {
    if (!isWorkspaceSelectionLoaded || !serverId) {
      return;
    }
    if (waitingForStartupData && !startupGraceElapsed) {
      return;
    }
    if (routingToQuickInput) {
      return;
    }
    consumeQuickInputLaunch();
  }, [
    isWorkspaceSelectionLoaded,
    routingToQuickInput,
    serverId,
    startupGraceElapsed,
    waitingForStartupData,
  ]);

  if (!serverId || !isWorkspaceSelectionLoaded || (waitingForStartupData && !startupGraceElapsed)) {
    return <StartupSplashScreen />;
  }

  return (
    <Redirect
      href={resolveHostIndexRoute({
        serverId,
        workspaceSelection,
        workspaceSelectionStatus,
        quickInput: {
          enabled: settings.quickInputEnabled,
          launchConsumed,
          hasWorkspaces,
        },
      })}
    />
  );
}
