import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSelect } from "@/components/settings";
import { useAppSettings, type LinkOpenBehavior } from "@/hooks/use-settings";

const LINK_OPEN_BEHAVIORS: readonly LinkOpenBehavior[] = ["system", "webview"];

export function LinkOpeningSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo(
    () =>
      LINK_OPEN_BEHAVIORS.map((value) => ({
        value,
        label: t(`settings.general.linkOpening.options.${value}`),
      })),
    [t],
  );
  const change = useCallback(
    (linkOpenBehavior: LinkOpenBehavior) => void updateSettings({ linkOpenBehavior }),
    [updateSettings],
  );
  return (
    <SettingsSection title={t("settings.general.linkOpening.title")}>
      <SettingsCard>
        <SettingsSelect
          label={t("settings.general.linkOpening.label")}
          hint={t(`settings.general.linkOpening.descriptions.${settings.linkOpenBehavior}`)}
          value={settings.linkOpenBehavior}
          options={options}
          onValueChange={change}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
