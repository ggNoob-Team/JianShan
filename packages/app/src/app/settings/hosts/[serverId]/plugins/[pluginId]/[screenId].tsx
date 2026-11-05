import { useMemo } from "react";

import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { RouteSuspense } from "@/components/route-suspense";
import { LazySettingsScreen } from "@/screens/settings-screen-lazy";

export default function PluginSettingsRoute() {
  const { serverId, pluginId, screenId } = useLocalSearchParams<{
    serverId: string;
    pluginId: string;
    screenId: string;
  }>();
  const view = useMemo(
    () => ({ kind: "plugin" as const, serverId, pluginId, screenId }),
    [serverId, pluginId, screenId],
  );
  return (
    <HostRouteBootstrapBoundary>
      <RouteSuspense>
        <LazySettingsScreen view={view} />
      </RouteSuspense>
    </HostRouteBootstrapBoundary>
  );
}
