import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { RouteSuspense } from "@/components/route-suspense";
import { LazySettingsScreen } from "@/screens/settings-screen-lazy";
import { buildSettingsHostSectionRoute, normalizeHostSectionSlug } from "@/utils/host-routes";

export default function SettingsHostSectionRoute() {
  const params = useLocalSearchParams<{ serverId?: string; hostSection?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId.trim() : "";
  const rawSection = typeof params.hostSection === "string" ? params.hostSection : "";
  const section = normalizeHostSectionSlug(rawSection) ?? "connections";
  const view = useMemo(() => ({ kind: "host" as const, serverId, section }), [serverId, section]);

  if (rawSection === "pair-device" && serverId) {
    return <Redirect href={buildSettingsHostSectionRoute(serverId, "devices")} />;
  }

  return (
    <HostRouteBootstrapBoundary>
      <RouteSuspense>
        <LazySettingsScreen view={view} />
      </RouteSuspense>
    </HostRouteBootstrapBoundary>
  );
}
