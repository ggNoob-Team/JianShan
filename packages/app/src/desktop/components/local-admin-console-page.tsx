import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ExternalLink, RotateCw } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MenuHeader } from "@/components/headers/menu-header";
import { Button } from "@/components/ui/button";
import { useDaemonStatus } from "@/desktop/hooks/use-daemon-status";
import type { Theme } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";
import { LocalAdminConsoleWebview } from "./local-admin-console-webview";

const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedRotateCw = withUnistyles(RotateCw);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function LocalAdminConsolePage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useDaemonStatus();
  const adminUrl = data?.status.adminUrl ?? null;
  const [currentUrl, setCurrentUrl] = useState<string | null>(adminUrl);

  useEffect(() => {
    setCurrentUrl(adminUrl);
  }, [adminUrl]);

  const handleOpenInBrowser = useCallback(() => {
    if (currentUrl) void openExternalUrl(currentUrl);
  }, [currentUrl]);
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const browserIcon = useMemo(
    () => <ThemedExternalLink size={14} uniProps={mutedIconMapping} />,
    [],
  );
  const refreshIcon = useMemo(() => <ThemedRotateCw size={14} uniProps={mutedIconMapping} />, []);

  return (
    <View style={styles.container} testID="local-admin-console-page">
      <MenuHeader borderless />
      <View style={styles.toolbar}>
        <View style={styles.addressShell}>
          <Text style={styles.address} numberOfLines={1} selectable>
            {currentUrl ?? t("desktop.daemon.admin.unavailable")}
          </Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          leftIcon={browserIcon}
          onPress={handleOpenInBrowser}
          disabled={!currentUrl}
          testID="open-local-admin-console-in-browser"
        >
          {t("desktop.daemon.admin.browserOpen")}
        </Button>
      </View>
      {adminUrl ? (
        <LocalAdminConsoleWebview initialUrl={adminUrl} onUrlChange={setCurrentUrl} />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{t("desktop.daemon.admin.title")}</Text>
          <Text style={styles.emptyHint}>{error ?? t("desktop.daemon.admin.hint")}</Text>
          <Button
            variant="outline"
            size="sm"
            leftIcon={refreshIcon}
            onPress={handleRefresh}
            disabled={isLoading}
            testID="refresh-local-admin-console-page"
          >
            {t("common.actions.retry")}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  toolbar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  addressShell: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  address: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  emptyState: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 520,
    marginTop: theme.spacing[12],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.medium,
  },
  emptyHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
  },
}));
