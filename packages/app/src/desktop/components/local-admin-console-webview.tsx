import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function LocalAdminConsoleWebview(_props: {
  initialUrl: string;
  onUrlChange: (url: string) => void;
}) {
  return <View style={styles.host} testID="local-admin-console-webview-unavailable" />;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
