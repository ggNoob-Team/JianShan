import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { getDesktopHost } from "@/desktop/host";

interface AdminConsoleWebviewElement extends HTMLElement {
  getURL?: () => string;
}

export function LocalAdminConsoleWebview({
  initialUrl,
  onUrlChange,
}: {
  initialUrl: string;
  onUrlChange: (url: string) => void;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<View>(null);
  const partition = getDesktopHost()?.browser?.profilePartition ?? null;

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || !partition) return;

    const webview = document.createElement("webview") as AdminConsoleWebviewElement;
    webview.setAttribute("partition", partition);
    webview.setAttribute("src", initialUrl);
    webview.setAttribute("allowpopups", "false");
    webview.style.display = "inline-flex";
    webview.style.flex = "1";
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "none";
    const reportUrl = () => {
      const nextUrl = webview.getURL?.();
      if (nextUrl) onUrlChange(nextUrl);
    };
    webview.addEventListener("did-navigate", reportUrl);
    webview.addEventListener("did-navigate-in-page", reportUrl);
    webview.addEventListener("dom-ready", reportUrl);
    host.replaceChildren(webview);

    return () => {
      webview.removeEventListener("did-navigate", reportUrl);
      webview.removeEventListener("did-navigate-in-page", reportUrl);
      webview.removeEventListener("dom-ready", reportUrl);
      host.replaceChildren();
    };
  }, [initialUrl, onUrlChange, partition]);

  if (!partition) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableText}>{t("desktop.daemon.admin.webviewUnavailable")}</Text>
      </View>
    );
  }

  return <View ref={hostRef} style={styles.host} testID="local-admin-console-webview" />;
}

const styles = StyleSheet.create((theme) => ({
  host: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  unavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  unavailableText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
}));
