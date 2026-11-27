import { Text, View } from "react-native";
import { Network, ShieldCheck } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import type { Theme } from "@/styles/theme";

const ThemedShieldCheck = withUnistyles(ShieldCheck);
const ThemedNetwork = withUnistyles(Network);
const accentBrightColorMapping = (theme: Theme) => ({ color: theme.colors.accentBright });

export interface RelayConsentPromptProps {
  title: string;
  description: string;
  docsUrl: string;
  docsLabel: string;
  docsAccessibilityLabel: string;
  enableLabel: string;
  enablingLabel: string;
  retryLabel: string;
  cancelLabel: string;
  updateRequired: string;
  footerHint: string;
  pending: boolean;
  error: string | null;
  canConfigureRelay: boolean;
  onEnable: () => void;
  onCancel: () => void;
}

export function RelayConsentPrompt(props: RelayConsentPromptProps) {
  let enableButtonLabel = props.enableLabel;
  if (props.pending) {
    enableButtonLabel = props.enablingLabel;
  } else if (props.error) {
    enableButtonLabel = props.retryLabel;
  }

  return (
    <View style={styles.consent}>
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <ThemedShieldCheck size={20} uniProps={accentBrightColorMapping} />
        </View>
        <Text style={styles.consentTitle}>{props.title}</Text>
        <Text style={styles.consentDescription}>{props.description}</Text>
        <ExternalLink
          href={props.docsUrl}
          label={props.docsLabel}
          accessibilityLabel={props.docsAccessibilityLabel}
        />
      </View>
      {props.error ? <Alert size="sm" variant="error" description={props.error} /> : null}
      {!props.canConfigureRelay ? (
        <Alert size="sm" variant="warning" description={props.updateRequired} />
      ) : null}
      <View style={styles.actions}>
        <Button variant="secondary" style={styles.actionButton} onPress={props.onCancel}>
          {props.cancelLabel}
        </Button>
        {props.canConfigureRelay ? (
          <Button
            variant="default"
            style={styles.actionButton}
            loading={props.pending}
            onPress={props.onEnable}
          >
            {enableButtonLabel}
          </Button>
        ) : null}
      </View>
      <View style={styles.directRow}>
        <ThemedNetwork size={14} style={styles.directIcon} />
        <Text style={styles.directHint}>{props.footerHint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  consent: {
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
  actionButton: {
    flex: 1,
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
    marginTop: 1,
  },
  directHint: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
  },
}));
