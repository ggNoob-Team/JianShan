import { describe, expect, it } from "vitest";
import type { TeamInsights, TeamMemberInsights } from "@getpaseo/protocol/team-insights";

import {
  buildTeamInsightsRequest,
  formatTeamDuration,
  formatTeamNumber,
  heatLevel,
  listTeamMembers,
  selectTeamMember,
} from "./team-screen-model";

const member: TeamMemberInsights = {
  id: "role_admin",
  name: "书记",
  seconds: 540,
  sessions: 2,
  projects: [],
  timeComponents: [],
  sessionDistribution: [],
  questionCount: 3,
  acceptedQuestionCount: 3,
  completedTurns: 2,
  tokenDataAvailable: true,
  inputTokens: 1000,
  cachedInputTokens: 200,
  outputTokens: 300,
  totalCostUsd: 0.01,
  lastActiveAt: null,
  heatmap: [],
};

const unassigned: TeamMemberInsights = {
  ...member,
  id: "unassigned",
  name: "未分配",
  sessions: 0,
};

const team: TeamInsights = {
  generatedAt: "2026-11-13T03:00:00.000Z",
  start: "2026-11-06T03:00:00.000Z",
  end: "2026-11-13T03:00:00.000Z",
  timeZone: "Asia/Shanghai",
  members: [member],
  unassigned,
  summary: {
    totalSeconds: 540,
    sessions: 2,
    questions: 3,
    completedTurns: 2,
    inputTokens: 1000,
    cachedInputTokens: 200,
    outputTokens: 300,
    totalCostUsd: 0.01,
  },
};

describe("team screen model", () => {
  it("builds the same seven-day request used by the admin team page", () => {
    expect(
      buildTeamInsightsRequest({
        days: 7,
        nowMs: Date.parse("2026-11-13T03:00:00.000Z"),
        timeZone: "Asia/Shanghai",
      }),
    ).toEqual({
      start: "2026-11-06T03:00:00.000Z",
      end: "2026-11-13T03:00:00.000Z",
      timeZone: "Asia/Shanghai",
    });
  });

  it("lists members with the unassigned bucket and preserves a valid selection", () => {
    expect(listTeamMembers(team).map((entry) => entry.name)).toEqual(["书记", "未分配"]);
    expect(selectTeamMember(team, "unassigned")?.name).toBe("未分配");
    expect(selectTeamMember(team, "missing")?.name).toBe("书记");
  });

  it("formats the same values and heat levels as the admin page", () => {
    expect(formatTeamDuration(540)).toBe("9 分钟");
    expect(formatTeamDuration(5400)).toBe("1 小时 30 分钟");
    expect(formatTeamNumber(12345)).toContain("1.2");
    expect([0, 120, 300, 600, 900].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});
