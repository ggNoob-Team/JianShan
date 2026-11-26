import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as QRCode from "qrcode";
import { SvgXml } from "react-native-svg";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Network, RotateCw, ShieldCheck } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { MAX_CLIENT_NAME_LENGTH, normalizeClientName } from "@getpaseo/protocol/agent-actor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import { daemonPairingOfferQueryKey } from "@/data/daemon-pairing";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeClient, useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import {
  EditingTextInput as TextInput,
  type EditingTextInputHandle,
} from "@/components/ui/text-input";

const RELAY_DOCS_URL = "https://paseo.sh/docs/security";
export const CONNECTIVITY_DOCS_URL = "https://paseo.sh/docs/connectivity";
export const TAILSCALE_DOCS_URL = `${CONNECTIVITY_DOCS_URL}#tailscale`;
const FLEX_ONE_STYLE = { flex: 1 } as const;
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedShieldCheck = withUnistyles(ShieldCheck);
const ThemedNetwork = withUnistyles(Network);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const accentBrightColorMapping = (theme: Theme) => ({ color: theme.colors.accentBright });

export interface PairDeviceSectionProps {
  serverId: string;
  visible: boolean;
  onClose: () => void;
}

type PairingClient = NonNullable<ReturnType<typeof useHostRuntimeClient>>;
type DaemonConfigPatcher = ReturnType<typeof useDaemonConfig>["patchConfig"];

interface PairDeviceRoleNameState {
  roleName: string;
  submittedRoleName: string | null;
  canSubmit: boolean;
  inputRef: RefObject<EditingTextInputHandle | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function usePairDeviceRoleName(visible: boolean): PairDeviceRoleNameState {
  const inputRef = useRef<EditingTextInputHandle>(null);
  const [roleName, setRoleName] = useState("");
  const [submittedRoleName, setSubmittedRoleName] = useState<string | null>(null);
  const normalizedRoleName = normalizeClientName(roleName);
  const canSubmit =
    normalizedRoleName !== undefined && normalizedRoleName.length <= MAX_CLIENT_NAME_LENGTH;

  useEffect(() => {
    if (visible) return;
    setRoleName("");
    setSubmittedRoleName(null);
    inputRef.current?.replaceText("");
  }, [visible]);

  const onChange = useCallback((value: string) => setRoleName(value), []);
  const onSubmit = useCallback(() => {
    const nextRoleName = normalizeClientName(roleName);
    if (!nextRoleName || nextRoleName.length > MAX_CLIENT_NAME_LENGTH) return;
    setSubmittedRoleName(nextRoleName);
  }, [roleName]);

  return { roleName, submittedRoleName, canSubmit, inputRef, onChange, onSubmit };
}

function shouldAskForRoleName(input: {
  supportsPairingRpc: boolean;
  isConnected: boolean;
  submittedRoleName: string | null;
}): boolean {
  return input.supportsPairingRpc && input.isConnected && input.submittedRoleName === null;
}

async function requestPairingOffer(input: {
  client: PairingClient | null;
  clientName: string | null;
  disconnectedMessage: string;
  roleNameRequiredMessage: string;
}) {
  if (!input.client) throw new Error(input.disconnectedMessage);
  if (!input.clientName) throw new Error(input.roleNameRequiredMessage);
  return input.client.getDaemonPairingOffer({ clientName: input.clientName });
}

async function enablePairingRelay(input: {
  client: PairingClient | null;
  patchConfig: DaemonConfigPatcher;
  refetch: () => Promise<unknown>;
  updateRequiredMessage: string;
  disconnectedMessage: string;
}) {
  if (input.client?.getLastServerInfoMessage()?.features?.relayConfig !== true) {
    throw new Error(input.updateRequiredMessage);
  }
  const config = await input.patchConfig({ relay: { enabled: true } });
  if (!config) throw new Error(input.disconnectedMessage);
  return input.refetch();
}

export function PairDeviceSection({ serverId, visible, onClose }: PairDeviceSectionProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const runtimeSnapshot = useHostRuntimeSnapshot(serverId);
  const isConnected = runtimeSnapshot?.connectionStatus === "online";
  const isDisconnected =
    runtimeSnapshot?.connectionStatus === "offline" ||
    runtimeSnapshot?.connectionStatus === "error";
  const { patchConfig } = useDaemonConfig(serverId);
  const [copied, setCopied] = useState(false);
  const {
    roleName,
    submittedRoleName,
    canSubmit: canSubmitRoleName,
    inputRef: roleNameInputRef,
    onChange: handleRoleNameChange,
    onSubmit: handleSubmitRoleName,
  } = usePairDeviceRoleName(visible);
  const serverFeatures = client?.getLastServerInfoMessage()?.features;
  const supportsPairingRpc = serverFeatures?.daemonStatusRpc === true;
  const canConfigureRelay = supportsPairingRpc && serverFeatures?.relayConfig === true;

  const pairingQuery = useFetchQuery({
    queryKey: [...daemonPairingOfferQueryKey(serverId), submittedRoleName],
    queryFn: () =>
      requestPairingOffer({
        client,
        clientName: submittedRoleName,
        disconnectedMessage: t("workspace.terminal.hostDisconnected"),
        roleNameRequiredMessage: t("pairing.device.roleNameRequired"),
      }),
    enabled:
      visible && supportsPairingRpc && Boolean(client && isConnected && submittedRoleName !== null),
    dataShape: "value",
    staleTimeMs: 5 * 60 * 1000,
    retry: 1,
  });

  const enableRelay = useMutation({
    mutationFn: () =>
      enablePairingRelay({
        client,
        patchConfig,
        refetch: pairingQuery.refetch,
        updateRequiredMessage: t("pairing.device.updateRequired"),
        disconnectedMessage: t("workspace.terminal.hostDisconnected"),
      }),
  });

  const qrQuery = useFetchQuery({
    queryKey: ["daemon-pairing-offer-qr", pairingQuery.data?.url],
    queryFn: () =>
      QRCode.toString(pairingQuery.data?.url ?? "", {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
      }),
    enabled: Boolean(pairingQuery.data?.url),
    dataShape: "value",
    staleTimeMs: 5 * 60 * 1000,
  });

  const handleCopyLink = useCallback(async () => {
    if (!pairingQuery.data?.url) return;
    await Clipboard.setStringAsync(pairingQuery.data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [pairingQuery.data?.url]);
  const handleCopyPress = useCallback(() => {
    void handleCopyLink();
  }, [handleCopyLink]);
  const handleRetry = useCallback(() => {
    void pairingQuery.refetch();
  }, [pairingQuery]);
  const handleEnableRelay = useCallback(() => {
    enableRelay.mutate();
  }, [enableRelay]);

  const qrSvg = useMemo(() => qrQuery.data ?? null, [qrQuery.data]);
  const needsRoleName = shouldAskForRoleName({
    supportsPairingRpc,
    isConnected,
    submittedRoleName,
  });

  return (
    <View testID="pair-device-content">
      {needsRoleName ? (
        <PairDeviceRoleNameForm
          roleName={roleName}
          canSubmit={canSubmitRoleName}
          inputRef={roleNameInputRef}
          onChange={handleRoleNameChange}
          onSubmit={handleSubmitRoleName}
        />
      ) : (
        <PairDeviceBody
          isPending={supportsPairingRpc && pairingQuery.isPending}
          isDisconnected={isDisconnected}
          error={pairingQuery.error}
          offer={pairingQuery.data}
          roleName={submittedRoleName}
          canConfigureRelay={canConfigureRelay}
          enablePending={enableRelay.isPending}
          enableError={enableRelay.error}
          qrSvg={qrSvg}
          qrError={qrQuery.isError}
          copied={copied}
          onRetry={handleRetry}
          onEnableRelay={handleEnableRelay}
          onClose={onClose}
          onCopy={handleCopyPress}
        />
      )}
    </View>
  );
}

function PairDeviceRoleNameForm({
  roleName,
  canSubmit,
  inputRef,
  onChange,
  onSubmit,
}: {
  roleName: string;
  canSubmit: boolean;
  inputRef: RefObject<EditingTextInputHandle | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.roleName}>
      <View style={styles.hero}>
        <RelayHeroBadge />
        <Text style={styles.consentTitle}>{t("pairing.device.roleNameTitle")}</Text>
        <Text style={styles.consentDescription}>{t("pairing.device.roleNameDescription")}</Text>
      </View>
      <Field
        label={t("pairing.device.roleNameLabel")}
        hint={t("pairing.device.roleNameHint")}
        testID="pair-device-role-name-field"
      >
        <FormTextInput
          ref={inputRef}
          initialValue={roleName}
          onChangeText={onChange}
          onSubmitEditing={canSubmit ? onSubmit : undefined}
          placeholder={t("pairing.device.roleNamePlaceholder")}
          accessibilityLabel={t("pairing.device.roleNameLabel")}
          testID="pair-device-role-name-input"
          maxLength={MAX_CLIENT_NAME_LENGTH}
          returnKeyType="go"
          autoCapitalize="words"
          autoCorrect={false}
        />
      </Field>
      <Button
        variant="default"
        style={FLEX_ONE_STYLE}
        onPress={onSubmit}
        disabled={!canSubmit}
        testID="pair-device-role-name-submit"
      >
        {t("pairing.device.generatePairingLink")}
      </Button>
    </View>
  );
}

interface PairDeviceBodyProps {
  isPending: boolean;
  isDisconnected: boolean;
  error: Error | null;
  offer: { relayEnabled: boolean; url: string; clientName?: string } | undefined;
  roleName: string | null;
  canConfigureRelay: boolean;
  enablePending: boolean;
  enableError: Error | null;
  qrSvg: string | null;
  qrError: boolean;
  copied: boolean;
  onRetry: () => void;
  onEnableRelay: () => void;
  onClose: () => void;
  onCopy: () => void;
}

function PairDeviceBody(props: PairDeviceBodyProps) {
  const { t } = useTranslation();
  if (props.isDisconnected) {
    return (
      <OfferLoadError message={t("workspace.terminal.hostDisconnected")} onRetry={props.onRetry} />
    );
  }
  if (props.isPending) {
    return <Text style={styles.stateLine}>{t("pairing.device.loadingOffer")}</Text>;
  }
  if (props.error) {
    return <OfferLoadError message={props.error.message} onRetry={props.onRetry} />;
  }
  if (!props.offer?.relayEnabled) {
    return <RelayConsent {...props} />;
  }
  if (!props.offer.url) {
    return <Text style={styles.stateLine}>{t("pairing.device.unavailable")}</Text>;
  }
  return <PairingOffer {...props} offer={props.offer} />;
}

function OfferLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert size="sm" variant="error" description={message}>
      <Button variant="outline" leftIcon={RotateCw} onPress={onRetry}>
        {t("pairing.device.retry")}
      </Button>
    </Alert>
  );
}

function RelayConsent(props: PairDeviceBodyProps) {
  const { t } = useTranslation();
  let enableButtonLabel = t("pairing.device.enableRelay");
  if (props.enablePending) {
    enableButtonLabel = t("pairing.device.enablingRelay");
  } else if (props.enableError) {
    enableButtonLabel = t("pairing.device.retry");
  }
  return (
    <View style={styles.consent}>
      <View style={styles.hero}>
        <RelayHeroBadge />
        <Text style={styles.consentTitle}>{t("pairing.device.enableTitle")}</Text>
        <Text style={styles.consentDescription}>{t("pairing.device.enableDescription")}</Text>
        <ExternalLink
          href={RELAY_DOCS_URL}
          label={t("pairing.device.relayDocs")}
          accessibilityLabel={t("pairing.device.relayDocsAccessibility")}
        />
      </View>
      {props.enableError ? (
        <Alert size="sm" variant="error" description={props.enableError.message} />
      ) : null}
      {!props.canConfigureRelay ? (
        <Alert size="sm" variant="warning" description={t("pairing.device.updateRequired")} />
      ) : null}
      <View style={styles.actions}>
        <Button variant="secondary" style={FLEX_ONE_STYLE} onPress={props.onClose}>
          {t("pairing.device.notNow")}
        </Button>
        {props.canConfigureRelay ? (
          <Button
            variant="default"
            style={FLEX_ONE_STYLE}
            loading={props.enablePending}
            onPress={props.onEnableRelay}
          >
            {enableButtonLabel}
          </Button>
        ) : null}
      </View>
      <View style={styles.directRow}>
        <ThemedNetwork size={14} style={styles.directIcon} />
        <View style={styles.directContent}>
          <Text style={styles.directHint}>{t("pairing.device.directConnectionHint")}</Text>
          <ExternalLink
            href={TAILSCALE_DOCS_URL}
            label={t("pairing.device.tailscaleDocs")}
            accessibilityLabel={t("pairing.device.tailscaleDocsAccessibility")}
          />
        </View>
      </View>
    </View>
  );
}

function RelayHeroBadge() {
  return (
    <View style={styles.heroBadge}>
      <ThemedShieldCheck size={20} uniProps={accentBrightColorMapping} />
    </View>
  );
}

function PairingOffer(props: PairDeviceBodyProps & { offer: { url: string } }) {
  const { t } = useTranslation();
  const inputRef = useRef<EditingTextInputHandle>(null);
  useEffect(() => inputRef.current?.replaceText(props.offer.url), [props.offer.url]);
  const roleName = props.offer.clientName ?? props.roleName;
  return (
    <View style={styles.offer}>
      {roleName ? (
        <Text style={styles.roleNameSummary}>
          {t("pairing.device.roleNameSummary", { name: roleName })}
        </Text>
      ) : null}
      <Text style={styles.offerHint}>{t("pairing.device.hint")}</Text>
      <View style={styles.qrTile}>
        <PairingQr svg={props.qrSvg} isError={props.qrError} />
      </View>
      <View style={styles.linkRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            ref={inputRef}
            style={styles.linkInput}
            initialValue={props.offer.url}
            readOnly
            selectTextOnFocus
            accessibilityLabel={t("pairing.link.label")}
          />
        </View>
        <Button variant="outline" leftIcon={props.copied ? Check : Copy} onPress={props.onCopy}>
          {props.copied ? t("pairing.device.copied") : t("pairing.device.copy")}
        </Button>
      </View>
      <Alert size="sm" variant="warning" description={t("pairing.device.securityWarning")} />
    </View>
  );
}

function PairingQr({ svg, isError }: { svg: string | null; isError: boolean }) {
  const { t } = useTranslation();
  if (svg) {
    return (
      <SvgXml
        xml={svg}
        width="100%"
        height="100%"
        accessibilityRole="image"
        accessibilityLabel={t("pairing.device.qrAccessibility")}
      />
    );
  }
  if (isError) {
    return <Text style={styles.hint}>{t("pairing.device.qrUnavailable")}</Text>;
  }
  return <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />;
}

const styles = StyleSheet.create((theme) => ({
  stateLine: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
    paddingVertical: theme.spacing[6],
  },
  consent: {
    gap: theme.spacing[4],
  },
  roleName: {
    gap: theme.spacing[4],
  },
  hero: {
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[1],
  },
  consentTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  consentDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  directRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[4],
  },
  directIcon: {
    color: theme.colors.foregroundMuted,
    marginTop: 1, // optical: seats the glyph on the hint's first text line
  },
  directContent: {
    flex: 1,
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  directHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
  },
  offer: {
    gap: theme.spacing[4],
  },
  offerHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  roleNameSummary: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  qrTile: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    width: 304,
    maxWidth: "100%",
    aspectRatio: 1,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.palette.white,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  inputWrapper: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  linkInput: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    outlineStyle: "none",
  } as object,
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
