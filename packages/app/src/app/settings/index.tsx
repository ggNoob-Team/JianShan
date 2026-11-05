import { Redirect } from "expo-router";
import { RouteSuspense } from "@/components/route-suspense";
import { useIsCompactFormFactor } from "@/constants/layout";
import { LazySettingsScreen } from "@/screens/settings-screen-lazy";
import { buildSettingsSectionRoute } from "@/utils/host-routes";

const ROOT_VIEW = { kind: "root" as const };

export default function SettingsIndexRoute() {
  const isCompactLayout = useIsCompactFormFactor();

  if (!isCompactLayout) {
    return <Redirect href={buildSettingsSectionRoute("general")} />;
  }

  return (
    <RouteSuspense>
      <LazySettingsScreen view={ROOT_VIEW} />
    </RouteSuspense>
  );
}
