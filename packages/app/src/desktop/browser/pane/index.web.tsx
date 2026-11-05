import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import type { Theme } from "@/styles/theme";
import { isHttpUrl } from "@/utils/http-url";
import { useBrowserStore } from "../store";
import { BrowserPaneChrome } from "./chrome";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

const ThemedX = withUnistyles(X);
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const spinnerMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const noop = () => undefined;
const IFRAME_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
  "allow-top-navigation-by-user-activation",
].join(" ");

export function BrowserPane({ browserId }: BrowserPaneProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const browser = useBrowserStore((state) => state.browsersById[browserId] ?? null);
  const updateBrowser = useBrowserStore((state) => state.updateBrowser);
  const [sourceUrl, setSourceUrl] = useState<string | null>(browser?.url ?? null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [showEmbedNotice, setShowEmbedNotice] = useState(true);

  useEffect(() => {
    if (sourceUrl === null && browser?.url) {
      setSourceUrl(browser.url);
    }
  }, [browser?.url, sourceUrl]);

  const handleLoad = useCallback(() => {
    updateBrowser(browserId, {
      isLoading: false,
      lastError: null,
      canGoBack: false,
      canGoForward: false,
    });
  }, [browserId, updateBrowser]);

  const handleReload = useCallback(() => {
    updateBrowser(browserId, { isLoading: true, lastError: null });
    setReloadRevision((revision) => revision + 1);
  }, [browserId, updateBrowser]);

  const handleNavigate = useCallback(
    (url: string) => {
      if (!isHttpUrl(url)) {
        return;
      }
      updateBrowser(browserId, {
        url,
        title: "",
        isLoading: true,
        canGoBack: false,
        canGoForward: false,
        lastError: null,
      });
      setSourceUrl(url);
      setReloadRevision((revision) => revision + 1);
    },
    [browserId, updateBrowser],
  );

  const dismissEmbedNotice = useCallback(() => setShowEmbedNotice(false), []);
  const frameStyle = useMemo<CSSProperties>(
    () => ({ flex: 1, width: "100%", height: "100%", border: "none", backgroundColor: "#fff" }),
    [],
  );
  if (!browser || !sourceUrl) {
    return (
      <View style={styles.loading}>
        <ThemedActivityIndicator size="small" uniProps={spinnerMapping} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BrowserPaneChrome
        browserId={browserId}
        url={browser.url}
        canGoBack={false}
        canGoForward={false}
        isLoading={browser.isLoading}
        onBack={noop}
        onForward={noop}
        onReload={handleReload}
        onNavigate={handleNavigate}
      />
      {showEmbedNotice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t("workspace.browser.embedNotice")}</Text>
          <ToolbarButton
            label={t("common.actions.close")}
            onPress={dismissEmbedNotice}
            testID={`browser-dismiss-embed-notice-${browserId}`}
          >
            <ThemedX size={14} uniProps={mutedIconMapping} />
          </ToolbarButton>
        </View>
      ) : null}
      <View style={styles.frameWrap}>
        {createElement("iframe", {
          key: `${sourceUrl}:${reloadRevision}`,
          ref: iframeRef,
          allow: "fullscreen",
          onLoad: handleLoad,
          sandbox: IFRAME_SANDBOX,
          src: sourceUrl,
          style: frameStyle,
          title: browser.title || t("workspace.tabs.fallback.browser"),
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  frameWrap: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#fff",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  noticeText: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
