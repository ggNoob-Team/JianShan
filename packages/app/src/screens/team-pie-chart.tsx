import { useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { TeamMetricBucket } from "@getpaseo/protocol/team-insights";
import type { Theme } from "@/styles/theme";

import { teamAccentColor } from "./team-accent";
import { formatTeamDuration } from "./team-screen-model";

const VIEW_BOX = 120;
const CENTER = VIEW_BOX / 2;
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_SLICES = 7;

function normalizeRows(rows: TeamMetricBucket[], totalSeconds: number): TeamMetricBucket[] {
  const total =
    totalSeconds > 0 ? totalSeconds : rows.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
  const sorted = rows
    .filter((row) => Number(row.seconds) > 0)
    .map((row) =>
      Object.assign({}, row, {
        seconds: Number(row.seconds),
        share: total > 0 ? Number(row.seconds) / total : Number(row.share || 0),
      }),
    )
    .sort((left, right) => right.seconds - left.seconds);
  if (sorted.length <= MAX_SLICES) return sorted;
  const visible = sorted.slice(0, MAX_SLICES - 1);
  const remainder = sorted.slice(MAX_SLICES - 1);
  visible.push({
    key: "__other__",
    label: "其他",
    seconds: remainder.reduce((sum, row) => sum + row.seconds, 0),
    share: remainder.reduce((sum, row) => sum + row.share, 0),
  });
  return visible;
}

export interface TeamPieChartProps {
  title: string;
  note?: string;
  rows: TeamMetricBucket[];
  totalSeconds: number;
  labelFor?: (row: TeamMetricBucket) => string;
  testID?: string;
}

interface TeamPiePalette {
  palette: string[];
  trackColor: string;
}

const chartPaletteMapping = (theme: Theme): TeamPiePalette => ({
  palette: [
    teamAccentColor(theme),
    theme.colors.statusSuccess,
    theme.colors.palette.blue[400],
    theme.colors.statusMerged,
    theme.colors.statusWarning,
    theme.colors.palette.teal[200],
    theme.colors.foregroundMuted,
  ],
  trackColor: theme.colors.surface3,
});

function TeamPieChartView({
  title,
  note,
  rows,
  totalSeconds,
  labelFor = (row) => row.label,
  testID,
  palette,
  trackColor,
}: TeamPieChartProps & TeamPiePalette): ReactElement {
  const normalized = useMemo(() => normalizeRows(rows, totalSeconds), [rows, totalSeconds]);
  let consumed = 0;
  const chartLabel = normalized
    .map((row) => `${labelFor(row)} ${Math.round(row.share * 100)}%`)
    .join("，");

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {note ? <Text style={styles.muted}>{note}</Text> : null}
      </View>
      {normalized.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>暂无数据</Text>
        </View>
      ) : (
        <View
          style={styles.chartRow}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${title}饼图。${chartLabel}`}
        >
          <View style={styles.chartShell}>
            <Svg width={132} height={132} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={trackColor}
                strokeWidth={12}
              />
              <G rotation={-90} origin={`${CENTER}, ${CENTER}`}>
                {normalized.map((row, index) => {
                  const length = row.share * CIRCUMFERENCE;
                  const dash = Math.max(0, length - 2);
                  const offset = consumed;
                  consumed += length;
                  return (
                    <Circle
                      key={row.key}
                      cx={CENTER}
                      cy={CENTER}
                      r={RADIUS}
                      fill="none"
                      stroke={palette[index % palette.length]}
                      strokeWidth={12}
                      strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                      strokeDashoffset={-offset}
                    />
                  );
                })}
              </G>
            </Svg>
            <View pointerEvents="none" style={styles.centerLabel}>
              <Text style={styles.centerValue}>{formatTeamDuration(totalSeconds)}</Text>
              <Text style={styles.centerCaption}>估算投入</Text>
            </View>
          </View>
          <View style={styles.legend}>
            {normalized.map((row, index) => (
              <View key={row.key} style={styles.legendRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: palette[index % palette.length] }]}
                />
                <View style={styles.legendCopy}>
                  <Text numberOfLines={1} style={styles.legendLabel}>
                    {labelFor(row)}
                  </Text>
                  <Text style={styles.legendDuration}>{formatTeamDuration(row.seconds)}</Text>
                </View>
                <Text style={styles.legendShare}>{Math.round(row.share * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const ThemedTeamPieChart = withUnistyles(TeamPieChartView);

export function TeamPieChart(props: TeamPieChartProps): ReactElement {
  return <ThemedTeamPieChart {...props} uniProps={chartPaletteMapping} />;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  heading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    flexWrap: "wrap",
  },
  chartShell: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
  },
  centerValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  centerCaption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  legend: {
    flex: 1,
    minWidth: 180,
    gap: theme.spacing[2],
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  legendDot: {
    width: 9,
    height: 9,
    marginTop: 4,
    borderRadius: theme.borderRadius.full,
  },
  legendCopy: {
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  legendDuration: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  legendShare: {
    color: teamAccentColor(theme),
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    minHeight: 132,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
}));
