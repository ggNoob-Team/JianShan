import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { ExternalLink, RotateCw } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { useDaemonStatus } from "@/desktop/hooks/use-daemon-status";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";

const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedRotateCw = withUnistyles(RotateCw);

export function LocalAdminConsoleSection() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useDaemonStatus();
  const daemonStatus = data?.status ?? null;
  const adminUrl = daemonStatus?.adminUrl ?? null;

  const handleOpen = useCallback(() => {
    if (adminUrl) void openExternalUrl(adminUrl);
  }, [adminUrl]);
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const refreshIcon = useMemo(() => <ThemedRotateCw size={14} />, []);
  const openIcon = useMemo(() => <ThemedExternalLink size={14} />, []);
  const refreshButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={refreshIcon}
        onPress={handleRefresh}
        disabled={isLoading}
        testID="refresh-local-admin-console"
      >
        {t("common.actions.retry")}
      </Button>
    ),
    [handleRefresh, isLoading, refreshIcon, t],
  );

  return (
    <SettingsSection title={t("desktop.daemon.admin.title")} trailing={refreshButton}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            {adminUrl ? (
              <Text style={settingsStyles.rowHint} selectable>
                {adminUrl}
              </Text>
            ) : null}
            <Text style={settingsStyles.rowHint}>{t("desktop.daemon.admin.hint")}</Text>
            {error ? <Text style={settingsStyles.rowHint}>{error}</Text> : null}
          </View>
          <Button
            variant="outline"
            size="sm"
            leftIcon={openIcon}
            onPress={handleOpen}
            disabled={!adminUrl}
            testID="open-local-admin-console"
          >
            {t("desktop.daemon.admin.open")}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}
