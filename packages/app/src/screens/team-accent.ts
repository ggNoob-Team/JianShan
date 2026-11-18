import type { Theme } from "@/styles/theme";

/** Match the standalone admin console's blue primary in both themes. */
export function teamAccentColor(theme: Pick<Theme, "colorScheme">): string {
  return theme.colorScheme === "dark" ? "#7aa7ff" : "#1e40af";
}

export function teamAccentForeground(theme: Pick<Theme, "colorScheme">): string {
  return theme.colorScheme === "dark" ? "#0d1421" : "#ffffff";
}
