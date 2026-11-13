import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { RotateCw } from "lucide-react-native";
import type {
  TeamHeatmapDay,
  TeamInsights,
  TeamMemberInsights,
  TeamMetricBucket,
} from "@getpaseo/protocol/team-insights";
import { BackHeader } from "@/components/headers/back-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { StyleSheet } from "react-native-unistyles";

import {
  buildTeamInsightsRequest,
  formatTeamDuration,
  formatTeamNumber,
  heatLevel,
  listTeamMembers,
  selectTeamMember,
} from "./team-screen-model";

type TeamRange = "1" | "7" | "30";

const TEAM_RANGE_OPTIONS: { value: TeamRange; label: string; testID: string }[] = [
  { value: "1", label: "1 天", testID: "team-range-1" },
  { value: "7", label: "7 天", testID: "team-range-7" },
  { value: "30", label: "30 天", testID: "team-range-30" },
];

const SOURCE_LABELS: Record<string, string> = {
  input: "输入表达",
  agent: "AI 运行",
  thinking: "思考/阅读",
};

export function TeamScreen({ serverId }: { serverId: string }): ReactElement {
  const client = useHostRuntimeClient(serverId);
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const [range, setRange] = useState<TeamRange>("7");
  const [team, setTeam] = useState<TeamInsights | null>(null);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!client) {
      setIsLoading(false);
      setError("当前主机未连接");
      return;
    }
    setIsLoading(true);
    setError(null);
    const request = buildTeamInsightsRequest({ days: Number(range), nowMs: Date.now() });
    try {
      const payload = await client.getDaemonTeamInsights({ ...request, timeout: 5_000 });
      setTeam(payload.team);
      setActiveMemberId((current) => selectTeamMember(payload.team, current)?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "团队数据加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [client, range]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const members = useMemo(() => (team ? listTeamMembers(team) : []), [team]);
  const activeMember = useMemo(
    () => (team ? selectTeamMember(team, activeMemberId) : null),
    [activeMemberId, team],
  );
  const handleRefresh = useCallback(() => void loadTeam(), [loadTeam]);
  const headerActions = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={RotateCw}
        onPress={handleRefresh}
        disabled={isLoading}
        testID="team-refresh"
      >
        刷新
      </Button>
    ),
    [handleRefresh, isLoading],
  );

  let body: ReactElement;
  if (isLoading && !team) {
    body = (
      <View style={styles.centered} testID="team-loading">
        <LoadingSpinner color={styles.spinner.color} />
        <Text style={styles.muted}>正在加载团队数据…</Text>
      </View>
    );
  } else if (error && !team) {
    body = (
      <View style={styles.emptyState} testID="team-error">
        <Text style={styles.emptyTitle}>无法加载团队数据</Text>
        <Text style={styles.muted}>{error}</Text>
        <Button variant="outline" size="sm" onPress={handleRefresh}>
          重试
        </Button>
      </View>
    );
  } else if (team && activeMember) {
    body = (
      <>
        <MemberTabs
          members={members}
          activeMemberId={activeMember.id}
          onSelect={setActiveMemberId}
        />
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        <MemberContent member={activeMember} team={team} isWide={isWide} />
      </>
    );
  } else {
    body = (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>尚未发现团队成员。</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title="团队" rightContent={headerActions} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="team-screen"
      >
        <View style={styles.content}>
          <View style={[styles.headingRow, !isWide && styles.headingRowCompact]}>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>成员工作台</Text>
              <Text style={styles.title}>团队管理</Text>
              <Text style={styles.description}>选择成员，查看其当前会话、提问和模型消耗。</Text>
            </View>
            <SegmentedControl
              size="sm"
              value={range}
              onValueChange={setRange}
              options={TEAM_RANGE_OPTIONS}
              testID="team-range"
            />
          </View>

          {body}
        </View>
      </ScrollView>
    </View>
  );
}

function MemberTabs({
  members,
  activeMemberId,
  onSelect,
}: {
  members: TeamMemberInsights[];
  activeMemberId: string;
  onSelect: (memberId: string) => void;
}): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.memberTabs}
      testID="team-member-tabs"
    >
      {members.map((member) => (
        <MemberTab
          key={member.id}
          member={member}
          active={member.id === activeMemberId}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

function MemberTab({
  member,
  active,
  onSelect,
}: {
  member: TeamMemberInsights;
  active: boolean;
  onSelect: (memberId: string) => void;
}): ReactElement {
  const handlePress = useCallback(() => onSelect(member.id), [member.id, onSelect]);
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);
  const style = useMemo(() => [styles.memberTab, active && styles.memberTabActive], [active]);

  return (
    <PressHighlight
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={style}
      highlightStyle={styles.memberTabHighlight}
      testID={`team-member-${member.id}`}
    >
      <Text style={[styles.memberName, active && styles.memberNameActive]}>{member.name}</Text>
      <Text style={styles.memberMeta}>
        {formatTeamDuration(member.seconds)} · {member.sessions} 会话
      </Text>
    </PressHighlight>
  );
}

function MemberContent({
  member,
  team,
  isWide,
}: {
  member: TeamMemberInsights;
  team: TeamInsights;
  isWide: boolean;
}): ReactElement {
  return (
    <>
      <View style={styles.statGrid}>
        <MetricStat label="估算投入" value={formatTeamDuration(member.seconds)} />
        <MetricStat label="提问" value={String(member.questionCount)} />
        <MetricStat label="完成轮次" value={String(member.completedTurns)} />
        <MetricStat
          label="Token"
          value={
            member.tokenDataAvailable
              ? formatTeamNumber(member.inputTokens + member.outputTokens)
              : "—"
          }
        />
        <MetricStat label="会话" value={String(member.sessions)} />
      </View>

      <View style={[styles.detailGrid, !isWide && styles.detailGridCompact]}>
        <Panel style={styles.detailPanel}>
          <PanelHeading title="时间与分布" note="并行会话已去重" />
          <View style={styles.allocationGrid}>
            <Allocation title="时间构成" rows={member.timeComponents} />
            <Allocation title="项目" rows={member.projects} />
            <Allocation title="会话" rows={member.sessionDistribution} />
            <TokenDetails member={member} />
          </View>
        </Panel>
        <Panel style={styles.heatmapPanel}>
          <PanelHeading title="时间热力图" note={`每格 15 分钟 · ${team.timeZone}`} />
          <Heatmap days={member.heatmap} />
        </Panel>
      </View>
    </>
  );
}

function MetricStat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  return <View style={[styles.panel, style]}>{children}</View>;
}

function PanelHeading({ title, note }: { title: string; note: string }): ReactElement {
  return (
    <View style={styles.panelHeading}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.muted}>{note}</Text>
    </View>
  );
}

function Allocation({ title, rows }: { title: string; rows: TeamMetricBucket[] }): ReactElement {
  return (
    <View style={styles.allocation}>
      <Text style={styles.allocationTitle}>{title}</Text>
      <View style={styles.allocationList}>
        {rows.length === 0 ? (
          <Text style={styles.muted}>暂无数据</Text>
        ) : (
          rows.map((row) => {
            const share = Math.round(row.share * 100);
            return (
              <View key={row.key} style={styles.allocationRow}>
                <View style={styles.allocationLabels}>
                  <Text numberOfLines={1} style={styles.allocationLabel}>
                    {SOURCE_LABELS[row.key] ?? row.label}
                  </Text>
                  <Text style={styles.allocationShare}>{share}%</Text>
                </View>
                <View style={styles.allocationTrack}>
                  <View style={[styles.allocationFill, { width: `${Math.max(2, share)}%` }]} />
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function TokenDetails({ member }: { member: TeamMemberInsights }): ReactElement {
  const rows = [
    ["输入", member.tokenDataAvailable ? formatTeamNumber(member.inputTokens) : "尚未采集"],
    [
      "缓存输入",
      member.tokenDataAvailable ? formatTeamNumber(member.cachedInputTokens) : "尚未采集",
    ],
    ["输出", member.tokenDataAvailable ? formatTeamNumber(member.outputTokens) : "尚未采集"],
    ["费用", member.tokenDataAvailable ? `$${member.totalCostUsd.toFixed(4)}` : "尚未采集"],
  ];
  return (
    <View style={styles.allocation}>
      <Text style={styles.allocationTitle}>Token 明细</Text>
      <View style={styles.allocationList}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.tokenRow}>
            <Text style={styles.muted}>{label}</Text>
            <Text style={styles.tokenValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Heatmap({ days }: { days: TeamHeatmapDay[] }): ReactElement {
  if (days.length === 0) {
    return <Text style={styles.muted}>当前范围没有可用的时间数据。</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="team-heatmap">
      <View style={styles.heatmapDays}>
        {days.map((day) => (
          <View key={day.date} style={styles.heatmapRow}>
            <Text style={styles.heatmapDate}>{day.date.slice(5)}</Text>
            <View style={styles.heatmapSlots}>
              {Array.from(day.slots.entries()).map(([slot, seconds]) => {
                const time = `${String(Math.floor(slot / 4)).padStart(2, "0")}:${String((slot % 4) * 15).padStart(2, "0")}`;
                return (
                  <View
                    key={`${day.date}-${time}`}
                    accessibilityLabel={`${day.date} ${time} ${formatTeamDuration(seconds)}`}
                    style={[styles.heatCell, { opacity: 0.16 + heatLevel(seconds) * 0.19 }]}
                  />
                );
              })}
            </View>
          </View>
        ))}
        <View style={styles.heatLegend}>
          <Text style={styles.muted}>空缺</Text>
          {[0, 1, 2, 3, 4].map((level) => (
            <View key={level} style={[styles.heatLegendCell, { opacity: 0.16 + level * 0.19 }]} />
          ))}
          <Text style={styles.muted}>满 15 分钟</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  content: {
    width: "100%",
    maxWidth: 1320,
    alignSelf: "center",
    gap: theme.spacing[4],
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  headingRowCompact: {
    flexDirection: "column",
    gap: theme.spacing[3],
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.semibold,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
  centered: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  emptyState: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[6],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  inlineError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  memberTabs: {
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  memberTab: {
    minWidth: 138,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    gap: theme.spacing[1],
  },
  memberTabActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  memberTabHighlight: {
    backgroundColor: theme.colors.surface2,
  },
  memberName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  memberNameActive: {
    color: theme.colors.accent,
  },
  memberMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 148,
    minWidth: 140,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    gap: theme.spacing[2],
  },
  statLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  statValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
  detailGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[4],
  },
  detailGridCompact: {
    flexDirection: "column",
  },
  detailPanel: {
    flex: 1.05,
  },
  heatmapPanel: {
    flex: 0.95,
  },
  panel: {
    width: "100%",
    minWidth: 0,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
    gap: theme.spacing[4],
  },
  panelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  panelTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  allocationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[4],
  },
  allocation: {
    flexGrow: 1,
    flexBasis: 230,
    minWidth: 0,
    gap: theme.spacing[2],
  },
  allocationTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  allocationList: {
    gap: theme.spacing[2],
  },
  allocationRow: {
    gap: theme.spacing[1],
  },
  allocationLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  allocationLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  allocationShare: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  allocationTrack: {
    height: 5,
    overflow: "hidden",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  allocationFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  tokenValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  heatmapDays: {
    minWidth: 760,
    gap: theme.spacing[2],
  },
  heatmapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  heatmapDate: {
    width: 42,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  heatmapSlots: {
    flex: 1,
    flexDirection: "row",
    gap: 2,
  },
  heatCell: {
    flex: 1,
    height: 12,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  heatLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  heatLegendCell: {
    width: 16,
    height: 10,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
}));
