import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { RelayConsentPrompt } from "@/components/relay-consent-prompt";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Alert as InlineAlert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import {
  useHostMutations,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
} from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import type { HostProfile } from "@/types/host-connection";

const RELAY_DOCS_URL = "https://paseo.sh/docs/security";
const RELAY_PROMPT_SNAP_POINTS = ["72%", "92%"];

export function RemoteLocalHostAccessCard({ host }: { host: HostProfile }) {
  const { t } = useTranslation();
  const localServerId = useLocalDaemonServerId();
  const localClient = useHostRuntimeClient(localServerId ?? "");
  const remoteConnected = useHostRuntimeIsConnected(host.serverId);
  const localConnected = useHostRuntimeIsConnected(localServerId ?? "");
  const { config, isLoading: isConfigLoading, patchConfig } = useDaemonConfig(localServerId);
  const { setRemoteLocalHostAccess } = useHostMutations();
  const [isSaving, setIsSaving] = useState(false);
  const [isEnablingRelay, setIsEnablingRelay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [isRelayPromptOpen, setIsRelayPromptOpen] = useState(false);
  const canConfigureRelay = localClient?.getLastServerInfoMessage()?.features?.relayConfig === true;
  const enabled =
    host.remoteLocalHost?.enabled === true && host.remoteLocalHost.localServerId === localServerId;
  const relayPromptHeader = useMemo<SheetHeader>(
    () => ({ title: t("settings.host.remoteLocalHost.relayPrompt.title") }),
    [t],
  );

  const updateAccess = useCallback(
    async (next: boolean) => {
      setIsSaving(true);
      setError(null);
      try {
        await setRemoteLocalHostAccess(host.serverId, next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setIsSaving(false);
      }
    },
    [host.serverId, setRemoteLocalHostAccess],
  );

  const handleValueChange = useCallback(
    (next: boolean) => {
      if (!next || config?.relay?.enabled === true) {
        void updateAccess(next);
        return;
      }
      setRelayError(null);
      setIsRelayPromptOpen(true);
    },
    [config?.relay?.enabled, updateAccess],
  );

  const closeRelayPrompt = useCallback(() => {
    if (isEnablingRelay) return;
    setIsRelayPromptOpen(false);
  }, [isEnablingRelay]);
  const enableRelayAndAccess = useCallback(() => {
    setIsEnablingRelay(true);
    setRelayError(null);
    void patchConfig({ relay: { enabled: true } })
      .then(async (nextConfig) => {
        if (!nextConfig) {
          throw new Error(t("workspace.terminal.hostDisconnected"));
        }
        await setRemoteLocalHostAccess(host.serverId, true);
        setIsRelayPromptOpen(false);
        return undefined;
      })
      .catch((cause) => {
        setRelayError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setIsEnablingRelay(false));
  }, [host.serverId, patchConfig, setRemoteLocalHostAccess, t]);

  if (!localServerId || localServerId === host.serverId) return null;

  return (
    <>
      <SettingsSection title={t("settings.host.remoteLocalHost.title")}>
        <View style={settingsStyles.card} testID="host-page-remote-local-host-card">
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>
                {t("settings.host.remoteLocalHost.toggle")}
              </Text>
              <Text style={settingsStyles.rowHint}>{t("settings.host.remoteLocalHost.hint")}</Text>
              {!remoteConnected || !localConnected ? (
                <Text style={settingsStyles.rowHint}>
                  {t("settings.host.remoteLocalHost.offline")}
                </Text>
              ) : null}
            </View>
            <Switch
              value={enabled}
              disabled={
                isSaving ||
                isEnablingRelay ||
                isRelayPromptOpen ||
                isConfigLoading ||
                !remoteConnected ||
                !localConnected
              }
              onValueChange={handleValueChange}
              accessibilityLabel={t("settings.host.remoteLocalHost.accessibilityLabel")}
              testID="host-page-remote-local-host-switch"
            />
          </View>
          {error ? (
            <View style={settingsStyles.row}>
              <InlineAlert
                size="sm"
                variant="error"
                title={t("settings.host.remoteLocalHost.failed")}
                description={error}
                testID="host-page-remote-local-host-error"
              />
            </View>
          ) : null}
        </View>
      </SettingsSection>

      <AdaptiveModalSheet
        header={relayPromptHeader}
        visible={isRelayPromptOpen}
        onClose={closeRelayPrompt}
        snapPoints={RELAY_PROMPT_SNAP_POINTS}
        desktopMaxWidth={480}
        testID="host-page-remote-local-host-relay-prompt"
      >
        <RelayConsentPrompt
          title={t("pairing.device.enableTitle")}
          description={t("settings.host.remoteLocalHost.relayPrompt.description")}
          docsUrl={RELAY_DOCS_URL}
          docsLabel={t("pairing.device.relayDocs")}
          docsAccessibilityLabel={t("pairing.device.relayDocsAccessibility")}
          enableLabel={t("pairing.device.enableRelay")}
          enablingLabel={t("pairing.device.enablingRelay")}
          retryLabel={t("pairing.device.retry")}
          cancelLabel={t("pairing.device.notNow")}
          updateRequired={t("pairing.device.updateRequired")}
          footerHint={t("settings.host.remoteLocalHost.relayPrompt.footerHint")}
          pending={isEnablingRelay}
          error={relayError}
          canConfigureRelay={canConfigureRelay}
          onEnable={enableRelayAndAccess}
          onCancel={closeRelayPrompt}
        />
      </AdaptiveModalSheet>
    </>
  );
}
