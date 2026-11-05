import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ActivityIndicator, BackHandler, Platform, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useBrowserStore } from "../store";
import type { Theme } from "@/styles/theme";
import { isHttpUrl } from "@/utils/http-url";
import { BrowserPaneChrome } from "./chrome";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

type WebViewComponentProps = ComponentProps<typeof WebView>;
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const spinnerMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const FAVICON_SCRIPT = `
  (function () {
    var link = document.querySelector(
      'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    );
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "paseo-browser-favicon",
      url: link && link.href ? link.href : "",
    }));
  })();
  true;
`;

export function BrowserPane({ browserId, isInteractive = true }: BrowserPaneProps) {
  const { t } = useTranslation();
  const webViewRef = useRef<WebView>(null);
  const browser = useBrowserStore((state) => state.browsersById[browserId] ?? null);
  const updateBrowser = useBrowserStore((state) => state.updateBrowser);
  const [sourceUrl, setSourceUrl] = useState<string | null>(browser?.url ?? null);
  const canGoBack = browser?.canGoBack ?? false;
  const webViewSource = useMemo(() => ({ uri: sourceUrl ?? "about:blank" }), [sourceUrl]);

  useEffect(() => {
    if (sourceUrl === null && browser?.url) {
      setSourceUrl(browser.url);
    }
  }, [browser?.url, sourceUrl]);

  const handleNavigationStateChange = useCallback(
    (navigation: WebViewNavigation) => {
      const current = useBrowserStore.getState().browsersById[browserId];
      const title = navigation.title.trim();
      updateBrowser(browserId, {
        url: navigation.url,
        title: title || current?.title || "",
        isLoading: navigation.loading,
        canGoBack: navigation.canGoBack,
        canGoForward: navigation.canGoForward,
      });
    },
    [browserId, updateBrowser],
  );

  const handleLoadStart = useCallback(() => {
    updateBrowser(browserId, { isLoading: true, lastError: null });
  }, [browserId, updateBrowser]);

  const handleLoadEnd = useCallback(() => {
    updateBrowser(browserId, { isLoading: false });
    try {
      webViewRef.current?.injectJavaScript(FAVICON_SCRIPT);
    } catch {
      // The page can disappear between load completion and this injection.
    }
  }, [browserId, updateBrowser]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          type?: unknown;
          url?: unknown;
        };
        if (
          payload.type === "paseo-browser-favicon" &&
          typeof payload.url === "string" &&
          isHttpUrl(payload.url)
        ) {
          updateBrowser(browserId, { faviconUrl: payload.url });
        }
      } catch {
        // Pages are free to post unrelated messages; ignore anything unparseable.
      }
    },
    [browserId, updateBrowser],
  );

  const handleError = useCallback<NonNullable<WebViewComponentProps["onError"]>>(
    (event) => {
      updateBrowser(browserId, {
        isLoading: false,
        lastError: event.nativeEvent.description || t("workspace.browser.errors.failedToLoad"),
      });
    },
    [browserId, t, updateBrowser],
  );

  const handleHttpError = useCallback<NonNullable<WebViewComponentProps["onHttpError"]>>(
    (event) => {
      updateBrowser(browserId, {
        isLoading: false,
        lastError: `${t("workspace.browser.errors.failedToLoad")} (HTTP ${event.nativeEvent.statusCode})`,
      });
    },
    [browserId, t, updateBrowser],
  );

  const handleShouldStartLoad = useCallback<
    NonNullable<WebViewComponentProps["onShouldStartLoadWithRequest"]>
  >((request) => isHttpUrl(request.url) || request.url === "about:blank", []);

  const handleBack = useCallback(() => webViewRef.current?.goBack(), []);
  const handleForward = useCallback(() => webViewRef.current?.goForward(), []);
  const handleReload = useCallback(() => {
    const webView = webViewRef.current;
    if (!webView) {
      return;
    }
    if (useBrowserStore.getState().browsersById[browserId]?.isLoading) {
      webView.stopLoading();
      return;
    }
    webView.reload();
  }, [browserId]);

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
      if (url === sourceUrl) {
        webViewRef.current?.reload();
      } else {
        setSourceUrl(url);
      }
    },
    [browserId, sourceUrl, updateBrowser],
  );

  useEffect(() => {
    if (Platform.OS !== "android" || !isInteractive || !canGoBack) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      webViewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, isInteractive]);

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
        canGoBack={browser.canGoBack}
        canGoForward={browser.canGoForward}
        isLoading={browser.isLoading}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onNavigate={handleNavigate}
      />
      {browser.lastError ? (
        <View style={styles.errorRow}>
          <Text numberOfLines={2} style={styles.errorText}>
            {browser.lastError}
          </Text>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        allowsBackForwardNavigationGestures
        cacheEnabled
        domStorageEnabled
        javaScriptEnabled
        onError={handleError}
        onHttpError={handleHttpError}
        onLoadEnd={handleLoadEnd}
        onLoadStart={handleLoadStart}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        originWhitelist={["*"]}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={webViewSource}
        style={styles.webview}
        testID={`browser-webview-${browserId}`}
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
  errorRow: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
  },
}));
