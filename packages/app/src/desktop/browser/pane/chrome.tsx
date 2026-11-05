import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  PaneContentToolbar,
  ToolbarButton,
  ToolbarControls,
} from "@/components/ui/pane-content-toolbar";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import type { Theme } from "@/styles/theme";
import { isHttpUrl } from "@/utils/http-url";
import { openInSystemBrowser } from "@/utils/open-external-url";
import { normalizeWorkspaceBrowserUrl } from "../store";

const ThemedArrowLeft = withUnistyles(ArrowLeft);
const ThemedArrowRight = withUnistyles(ArrowRight);
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedEditingTextInput = withUnistyles(EditingTextInput, (theme: Theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.foreground,
}));
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const spinnerMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface BrowserPaneChromeProps {
  browserId: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNavigate: (url: string) => void;
}

export function BrowserPaneChrome({
  browserId,
  url,
  canGoBack,
  canGoForward,
  isLoading,
  onBack,
  onForward,
  onReload,
  onNavigate,
}: BrowserPaneChromeProps) {
  const { t } = useTranslation();
  const inputRef = useRef<EditingTextInputHandle>(null);
  const editingRef = useRef(false);
  const [draftUrl, setDraftUrl] = useState(url);

  const replaceDisplayedUrl = useCallback((nextUrl: string) => {
    setDraftUrl(nextUrl);
    inputRef.current?.replaceText(nextUrl, {
      start: nextUrl.length,
      end: nextUrl.length,
    });
  }, []);

  useEffect(() => {
    if (!editingRef.current) {
      replaceDisplayedUrl(url);
    }
  }, [replaceDisplayedUrl, url]);

  const handleFocus = useCallback(() => {
    editingRef.current = true;
    inputRef.current?.setSelection({ start: 0, end: draftUrl.length });
  }, [draftUrl.length]);

  const handleBlur = useCallback(() => {
    editingRef.current = false;
    replaceDisplayedUrl(url);
  }, [replaceDisplayedUrl, url]);

  const handleSubmit = useCallback(() => {
    const normalizedUrl = normalizeWorkspaceBrowserUrl(draftUrl);
    inputRef.current?.blur();
    editingRef.current = false;
    if (!isHttpUrl(normalizedUrl)) {
      replaceDisplayedUrl(url);
      return;
    }
    replaceDisplayedUrl(normalizedUrl);
    onNavigate(normalizedUrl);
  }, [draftUrl, onNavigate, replaceDisplayedUrl, url]);

  const handleOpenExternal = useCallback(() => {
    void openInSystemBrowser(url);
  }, [url]);

  return (
    <PaneContentToolbar style={styles.toolbar}>
      <ToolbarControls>
        <ToolbarButton
          label={t("workspace.browser.controls.back")}
          disabled={!canGoBack}
          onPress={onBack}
          testID={`browser-back-${browserId}`}
        >
          <ThemedArrowLeft size={16} uniProps={mutedIconMapping} />
        </ToolbarButton>
        <ToolbarButton
          label={t("workspace.browser.controls.forward")}
          disabled={!canGoForward}
          onPress={onForward}
          testID={`browser-forward-${browserId}`}
        >
          <ThemedArrowRight size={16} uniProps={mutedIconMapping} />
        </ToolbarButton>
        <ToolbarButton
          label={t("workspace.browser.controls.refresh")}
          onPress={onReload}
          testID={`browser-refresh-${browserId}`}
        >
          <ThemedRotateCw size={16} uniProps={mutedIconMapping} />
        </ToolbarButton>
      </ToolbarControls>
      <View style={styles.urlBar}>
        <ThemedEditingTextInput
          ref={inputRef}
          accessibilityLabel={t("workspace.browser.controls.browserUrl")}
          autoCapitalize="none"
          autoCorrect={false}
          initialValue={draftUrl}
          keyboardType="url"
          onBlur={handleBlur}
          onFocus={handleFocus}
          onSubmitEditing={handleSubmit}
          placeholder={t("workspace.browser.controls.enterUrl")}
          returnKeyType="go"
          selectTextOnFocus
          style={styles.urlInput}
          testID={`browser-url-${browserId}`}
        />
        {isLoading ? <ThemedActivityIndicator size="small" uniProps={spinnerMapping} /> : null}
      </View>
      <ToolbarControls>
        <ToolbarButton
          label={t("workspace.browser.controls.openInBrowser")}
          onPress={handleOpenExternal}
          testID={`browser-open-external-${browserId}`}
        >
          <ThemedExternalLink size={16} uniProps={mutedIconMapping} />
        </ToolbarButton>
      </ToolbarControls>
    </PaneContentToolbar>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  urlBar: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  urlInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
