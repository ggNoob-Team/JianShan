import { describe, expect, it } from "vitest";

import { TeamInsightsSchema, TeamMemberInsightsSchema } from "./team-insights.js";

const member = {
  id: "role_admin",
  name: "书记",
  seconds: 540,
  sessions: 2,
  projects: [{ key: "见山", label: "见山", seconds: 540, share: 1 }],
  timeComponents: [{ key: "agent", label: "AI 运行", seconds: 540, share: 1 }],
  sessionDistribution: [{ key: "agent-1", label: "团队页", seconds: 540, share: 1 }],
  questionCount: 3,
  acceptedQuestionCount: 3,
  completedTurns: 2,
  tokenDataAvailable: true,
  inputTokens: 1000,
  cachedInputTokens: 200,
  outputTokens: 300,
  totalCostUsd: 0.01,
  lastActiveAt: "2026-11-13T02:00:00.000Z",
  heatmap: [{ date: "2026-11-13", slots: [0, 15, 30] }],
};

describe("team insights protocol", () => {
  it("round-trips the member and team statistics shape", () => {
    const team = TeamInsightsSchema.parse({
      generatedAt: "2026-11-13T03:00:00.000Z",
      start: "2026-11-06T03:00:00.000Z",
      end: "2026-11-13T03:00:00.000Z",
      timeZone: "Asia/Shanghai",
      members: [member],
      unassigned: { ...member, id: "unassigned", name: "未分配", sessions: 0 },
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
    });

    expect(TeamMemberInsightsSchema.parse(member)).toEqual(member);
    expect(team.members[0]).toMatchObject({ name: "书记", sessions: 2 });
    expect(team.unassigned.name).toBe("未分配");
  });
});
