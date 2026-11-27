import { useCallback, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Pencil } from "lucide-react-native";
import { MAX_CLIENT_NAME_LENGTH, type PairingRole } from "@getpaseo/protocol/agent-actor";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useToast } from "@/contexts/toast-context";
import { useHostMutations } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { resolveHostClientName, resolveHostRole, type HostProfile } from "@/types/host-connection";
import { resolveLocalHostRoleUpdate } from "./local-host-role";

const ThemedPencil = withUnistyles(Pencil);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ROLES: readonly PairingRole[] = ["admin", "member"];

function roleLabel(t: TFunction, role: PairingRole): string {
  return t(`settings.host.localRole.type.options.${role}`);
}

function RoleMenuItem({
  role,
  selected,
  onChange,
}: {
  role: PairingRole;
  selected: boolean;
  onChange: (role: PairingRole) => void;
}) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => onChange(role), [onChange, role]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {roleLabel(t, role)}
    </DropdownMenuItem>
  );
}

export function HostClientRoleSection({ host }: { host: HostProfile }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { setHostClientIdentity } = useHostMutations();
  const [isNameEditorOpen, setIsNameEditorOpen] = useState(false);
  const role = resolveHostRole(host);
  const clientName = resolveHostClientName(host);

  const openNameEditor = useCallback(() => setIsNameEditorOpen(true), []);
  const closeNameEditor = useCallback(() => setIsNameEditorOpen(false), []);
  const submitName = useCallback(
    async (value: string) => {
      const update = resolveLocalHostRoleUpdate(host, value);
      if (!update) throw new Error(t("common.errors.nameRequired"));
      await setHostClientIdentity(host.serverId, update);
    },
    [host, setHostClientIdentity, t],
  );
  const changeRole = useCallback(
    (nextRole: PairingRole) => {
      if (!clientName) {
        toast.error(t("settings.host.localRole.type.nameRequired"));
        return;
      }
      void setHostClientIdentity(host.serverId, { clientName, role: nextRole }).catch(() => {
        toast.error(t("errors.unableToSave"));
      });
    },
    [clientName, host.serverId, setHostClientIdentity, t, toast],
  );

  return (
    <SettingsSection title={t("settings.host.localRole.title")}>
      <View style={settingsStyles.card} testID="host-client-role-section">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.host.localRole.name.label")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.host.localRole.name.hint")}</Text>
          </View>
          <View style={styles.value}>
            <Text style={styles.valueText} numberOfLines={1}>
              {clientName ?? t("settings.host.localRole.name.unset")}
            </Text>
            <PressHighlight
              onPress={openNameEditor}
              hitSlop={8}
              style={styles.editButton}
              accessibilityRole="button"
              accessibilityLabel={t("settings.host.localRole.name.editLabel")}
              testID="host-client-role-name-edit"
            >
              <ThemedPencil size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
            </PressHighlight>
          </View>
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.host.localRole.type.label")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.host.localRole.type.hint")}</Text>
          </View>
          <DropdownMenu>
            <DropdownTrigger
              disabled={!clientName}
              accessibilityRole="button"
              accessibilityLabel={t("settings.host.localRole.type.accessibilityLabel", {
                value: roleLabel(t, role),
              })}
              testID="host-client-role-type-trigger"
            >
              {roleLabel(t, role)}
            </DropdownTrigger>
            <DropdownMenuContent side="bottom" align="end" width={180}>
              {ROLES.map((option) => (
                <RoleMenuItem
                  key={option}
                  role={option}
                  selected={option === role}
                  onChange={changeRole}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </View>

      <AdaptiveRenameModal
        visible={isNameEditorOpen}
        title={t("settings.host.localRole.name.modalTitle")}
        initialValue={host.clientName ?? ""}
        placeholder={t("settings.host.localRole.name.placeholder")}
        submitLabel={t("settings.host.localRole.name.submit")}
        maxLength={MAX_CLIENT_NAME_LENGTH}
        onClose={closeNameEditor}
        onSubmit={submitName}
        testID="host-client-role-name-modal"
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  value: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  valueText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    flexShrink: 1,
  },
  editButton: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
}));
