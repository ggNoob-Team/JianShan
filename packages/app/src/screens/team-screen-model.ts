import type { TeamInsights, TeamMemberInsights } from "@getpaseo/protocol/team-insights";

export interface TeamInsightsRequest {
  start: string;
  end: string;
  timeZone: string;
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
