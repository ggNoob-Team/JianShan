import type {
  TeamInsights,
  TeamMemberInsights,
  TeamMetricBucket,
} from "@getpaseo/protocol/team-insights";

export interface TeamInsightsRequest {
  start: string;
  end: string;
  timeZone: string;
}

export interface TeamDateRange {
  startDate: string;
  endDate: string;
  days: number;
}

export const TEAM_DATE_PRESETS = [1, 2, 7, 30] as const;

const DAY_MS = 86_400_000;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createTeamDateRange(days: number, nowMs = Date.now()): TeamDateRange {
  const end = startOfLocalDay(new Date(nowMs));
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
  return {
    startDate: localDateKey(start),
    endDate: localDateKey(end),
    days,
  };
}

export function formatTeamDateRange(range: TeamDateRange): string {
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  const startLabel = `${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, "0")}.${String(start.getDate()).padStart(2, "0")}`;
  const endLabel =
    start.getFullYear() === end.getFullYear()
      ? `${String(end.getMonth() + 1).padStart(2, "0")}.${String(end.getDate()).padStart(2, "0")}`
      : `${end.getFullYear()}.${String(end.getMonth() + 1).padStart(2, "0")}.${String(end.getDate()).padStart(2, "0")}`;
  return `${startLabel}–${endLabel} · ${range.days} 天`;
}

export function buildTeamInsightsRequestForRange(input: {
  range: TeamDateRange;
  timeZone?: string;
}): TeamInsightsRequest {
  const start = new Date(`${input.range.startDate}T00:00:00`);
  const end = new Date(`${input.range.endDate}T00:00:00`);
  return {
    start: start.toISOString(),
    end: new Date(end.getTime() + DAY_MS - 1).toISOString(),
    timeZone: input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function buildTeamInsightsRequest(input: {
  days: number;
  nowMs: number;
  timeZone?: string;
}): TeamInsightsRequest {
  const end = new Date(input.nowMs);
  const start = new Date(end.getTime() - input.days * 86400000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function listTeamMembers(team: TeamInsights): TeamMemberInsights[] {
  return [...team.members, team.unassigned];
}

export interface TeamHostInsights {
  serverId: string;
  label: string;
  team: TeamInsights;
}

export interface TeamHostCandidate {
  serverId: string;
  label: string;
}

export interface TeamHostClassification<Host extends TeamHostCandidate> {
  ready: Host[];
  unsupported: Host[];
  pending: Host[];
  offline: Host[];
}

export function classifyTeamHosts<Host extends TeamHostCandidate>(input: {
  hosts: readonly Host[];
  connectionStatuses: ReadonlyMap<string, string | undefined>;
  featureAvailability: ReadonlyMap<string, boolean | null | undefined>;
}): TeamHostClassification<Host> {
  const classified: TeamHostClassification<Host> = {
    ready: [],
    unsupported: [],
    pending: [],
    offline: [],
  };
  for (const host of input.hosts) {
    const connectionStatus = input.connectionStatuses.get(host.serverId);
    if (connectionStatus === "connecting" || connectionStatus === "idle" || !connectionStatus) {
      classified.pending.push(host);
      continue;
    }
    if (connectionStatus !== "online") {
      classified.offline.push(host);
      continue;
    }
    const supported = input.featureAvailability.get(host.serverId);
    if (supported === true) classified.ready.push(host);
    else if (supported === false) classified.unsupported.push(host);
    else classified.pending.push(host);
  }
  return classified;
}

export function describeUnavailableTeamHosts(
  classification: Pick<
    TeamHostClassification<TeamHostCandidate>,
    "unsupported" | "pending" | "offline"
  >,
): string {
  if (classification.unsupported.length > 0) {
    const names = classification.unsupported.map((host) => host.label).join("、");
    return `${names} 的 Host 版本过旧，请更新 Host 后重试。`;
  }
  if (classification.pending.length > 0) {
    return "正在等待 Host 版本信息，请稍后重试。";
  }
  return "没有已连接的 Host";
}

export function formatTeamHostLoadFailure(
  failures: readonly { label: string; error: unknown }[],
): string {
  const details = failures.map(({ label, error }) => {
    const message = error instanceof Error ? error.message : String(error);
    return `${label}：${message}`;
  });
  return `团队数据加载失败：${details.join("；")}`;
}

interface MemberAccumulator {
  id: string;
  name: string;
  seconds: number;
  sessions: number;
  timeComponents: Map<string, { label: string; seconds: number }>;
  projects: Map<string, { label: string; seconds: number }>;
  accounts: Map<string, { label: string; seconds: number }>;
  sessionDistribution: Map<string, { label: string; seconds: number }>;
  heatmap: Map<string, number[]>;
  questionCount: number;
  acceptedQuestionCount: number;
  completedTurns: number;
  tokenDataAvailable: boolean;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  lastActiveAt: string | null;
}

function addBucket(
  buckets: Map<string, { label: string; seconds: number }>,
  key: string,
  label: string,
  seconds: number,
): void {
  if (seconds <= 0) return;
  const current = buckets.get(key);
  buckets.set(key, { label: current?.label ?? label, seconds: (current?.seconds ?? 0) + seconds });
}

function finishBuckets(
  buckets: Map<string, { label: string; seconds: number }>,
  totalSeconds: number,
): TeamMetricBucket[] {
  return [...buckets.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      seconds: value.seconds,
      share: totalSeconds > 0 ? value.seconds / totalSeconds : 0,
    }))
    .sort((left, right) => right.seconds - left.seconds);
}

function accumulatorFor(
  values: Map<string, MemberAccumulator>,
  member: TeamMemberInsights,
): MemberAccumulator {
  const existing = values.get(member.id);
  if (existing) return existing;
  const created: MemberAccumulator = {
    id: member.id,
    name: member.name,
    seconds: 0,
    sessions: 0,
    timeComponents: new Map(),
    projects: new Map(),
    accounts: new Map(),
    sessionDistribution: new Map(),
    heatmap: new Map(),
    questionCount: 0,
    acceptedQuestionCount: 0,
    completedTurns: 0,
    tokenDataAvailable: false,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    lastActiveAt: null,
  };
  values.set(member.id, created);
  return created;
}

function addMember(
  values: Map<string, MemberAccumulator>,
  member: TeamMemberInsights,
  host: { serverId: string; label: string },
): void {
  const accumulator = accumulatorFor(values, member);
  accumulator.seconds += member.seconds;
  accumulator.sessions += member.sessions;
  for (const row of member.timeComponents)
    addBucket(accumulator.timeComponents, row.key, row.label, row.seconds);
  for (const row of member.projects)
    addBucket(accumulator.projects, row.label, row.label, row.seconds);
  for (const row of member.sessionDistribution)
    addBucket(
      accumulator.sessionDistribution,
      `${host.serverId}:${row.key}`,
      row.label,
      row.seconds,
    );
  addBucket(accumulator.accounts, host.serverId, host.label, member.seconds);
  accumulator.questionCount += member.questionCount;
  accumulator.acceptedQuestionCount += member.acceptedQuestionCount;
  accumulator.completedTurns += member.completedTurns;
  accumulator.tokenDataAvailable ||= member.tokenDataAvailable;
  accumulator.inputTokens += member.inputTokens;
  accumulator.cachedInputTokens += member.cachedInputTokens;
  accumulator.outputTokens += member.outputTokens;
  accumulator.totalCostUsd += member.totalCostUsd;
  if (
    member.lastActiveAt &&
    (!accumulator.lastActiveAt ||
      Date.parse(member.lastActiveAt) > Date.parse(accumulator.lastActiveAt))
  ) {
    accumulator.lastActiveAt = member.lastActiveAt;
  }
  for (const day of member.heatmap) {
    const slots = accumulator.heatmap.get(day.date) ?? Array.from({ length: 96 }, () => 0);
    for (let index = 0; index < slots.length; index += 1) {
      slots[index] = (slots[index] ?? 0) + (day.slots[index] ?? 0);
    }
    accumulator.heatmap.set(day.date, slots);
  }
}

function finishMember(accumulator: MemberAccumulator): TeamMemberInsights {
  return {
    id: accumulator.id,
    name: accumulator.name,
    seconds: accumulator.seconds,
    sessions: accumulator.sessions,
    projects: finishBuckets(accumulator.projects, accumulator.seconds),
    accounts: finishBuckets(accumulator.accounts, accumulator.seconds),
    timeComponents: finishBuckets(accumulator.timeComponents, accumulator.seconds),
    sessionDistribution: finishBuckets(accumulator.sessionDistribution, accumulator.seconds),
    questionCount: accumulator.questionCount,
    acceptedQuestionCount: accumulator.acceptedQuestionCount,
    completedTurns: accumulator.completedTurns,
    tokenDataAvailable: accumulator.tokenDataAvailable,
    inputTokens: accumulator.inputTokens,
    cachedInputTokens: accumulator.cachedInputTokens,
    outputTokens: accumulator.outputTokens,
    totalCostUsd: accumulator.totalCostUsd,
    lastActiveAt: accumulator.lastActiveAt,
    heatmap: [...accumulator.heatmap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, slots]) => ({ date, slots })),
  };
}

export function mergeTeamInsightsForHosts(entries: TeamHostInsights[]): TeamInsights | null {
  const first = entries[0]?.team;
  if (!first) return null;
  const members = new Map<string, MemberAccumulator>();
  const unassigned = new Map<string, MemberAccumulator>();
  for (const { label, serverId, team } of entries) {
    for (const member of team.members) addMember(members, member, { serverId, label });
    addMember(unassigned, team.unassigned, { serverId, label });
  }
  const mergedMembers = [...members.values()].map(finishMember);
  const mergedUnassigned = finishMember(
    [...unassigned.values()][0] ?? accumulatorFor(unassigned, first.unassigned),
  );
  const allMembers = [...mergedMembers, mergedUnassigned];
  return {
    ...first,
    members: mergedMembers,
    unassigned: mergedUnassigned,
    summary: {
      totalSeconds: allMembers.reduce((sum, member) => sum + member.seconds, 0),
      sessions: allMembers.reduce((sum, member) => sum + member.sessions, 0),
      questions: allMembers.reduce((sum, member) => sum + member.questionCount, 0),
      completedTurns: allMembers.reduce((sum, member) => sum + member.completedTurns, 0),
      inputTokens: allMembers.reduce((sum, member) => sum + member.inputTokens, 0),
      cachedInputTokens: allMembers.reduce((sum, member) => sum + member.cachedInputTokens, 0),
      outputTokens: allMembers.reduce((sum, member) => sum + member.outputTokens, 0),
      totalCostUsd: allMembers.reduce((sum, member) => sum + member.totalCostUsd, 0),
    },
  };
}

export function selectTeamMember(
  team: TeamInsights,
  memberId: string | null,
): TeamMemberInsights | null {
  const members = listTeamMembers(team);
  return members.find((member) => member.id === memberId) ?? members[0] ?? null;
}

export function formatTeamDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function formatTeamNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
}

export function heatLevel(seconds: number): number {
  if (seconds === 0) return 0;
  if (seconds < 180) return 1;
  if (seconds < 420) return 2;
  if (seconds < 780) return 3;
  return 4;
}
