import type { Theme } from "@/styles/theme";

/** Match the myAgents team page's blue primary in both themes. */
export function teamAccentColor(theme: Pick<Theme, "colorScheme">): string {
  return theme.colorScheme === "dark" ? "#7aa7ff" : "#3459a6";
}

export function teamAccentForeground(theme: Pick<Theme, "colorScheme">): string {
  return theme.colorScheme === "dark" ? "#0d1421" : "#ffffff";
}

/** The categorical palette used by myAgents' team and personal dashboards. */
export function teamChartPalette(theme: Pick<Theme, "colorScheme">): string[] {
  if (theme.colorScheme === "dark") {
    return ["#7aa7ff", "#a3bffa", "#5dba80", "#e0a952", "#b6a0f0", "#ef8078", "#67c5d2", "#a7b4c8"];
  }
  return ["#3459a6", "#5f82ca", "#1d8451", "#b7791f", "#6d51b2", "#b73a34", "#2f8f9d", "#94a3b8"];
}
