import { Download } from "lucide-react-native";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { SidebarCalloutDescriptionText } from "@/components/sidebar-callout";
import { useSidebarCallouts } from "@/contexts/sidebar-callout-context";
import { useStableEvent } from "@/hooks/use-stable-event";
import type { Theme } from "@/styles/theme";
import { useAndroidAppUpdate } from "./android-app-update-provider";

const ThemedDownload = withUnistyles(Download);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function AndroidAppUpdateSource() {
  const { t } = useTranslation();
  const callouts = useSidebarCallouts();
  const { supported, status, result, downloadUpdate } = useAndroidAppUpdate();
  const download = useStableEvent(() => {
    void downloadUpdate();
  });

  useEffect(() => {
    if (!supported || status !== "available" || !result?.latestVersion) return undefined;

    return callouts.show({
      id: "android-app-update",
      dismissalKey: `android-app-update:${result.latestVersion}`,
      priority: 80,
      title: t("androidUpdates.callout.title"),
      description: (
        <>
          <SidebarCalloutDescriptionText>
            {t("androidUpdates.callout.description", {
              version: result.latestVersion,
              currentVersion: result.currentVersion,
            })}
          </SidebarCalloutDescriptionText>
          <SidebarCalloutDescriptionText>
            {t("androidUpdates.callout.installHint")}
          </SidebarCalloutDescriptionText>
        </>
      ),
      icon: <ThemedDownload size={14} uniProps={mutedColorMapping} />,
      actions: [
        {
          label: t("androidUpdates.callout.download"),
          onPress: download,
          variant: "primary",
        },
      ],
      testID: "android-app-update-callout",
    });
  }, [callouts, download, result?.currentVersion, result?.latestVersion, status, supported, t]);

  return null;
}
