import { describe, expect, it } from "vitest";
import type { TeamInsights, TeamMemberInsights } from "@getpaseo/protocol/team-insights";

import {
  buildTeamInsightsRequest,
  buildTeamInsightsRequestForRange,
  classifyTeamHosts,
  createTeamDateRange,
  describeUnavailableTeamHosts,
  formatTeamHostLoadFailure,
  formatTeamDuration,
  formatTeamDateRange,
  formatTeamNumber,
  heatLevel,
  listTeamMembers,
  mergeTeamInsightsForHosts,
  selectTeamMember,
} from "./team-screen-model";

const member: TeamMemberInsights = {
  id: "role_admin",
  name: "书记",
  seconds: 540,
  sessions: 2,
  projects: [],
  accounts: [],
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
  it("separates ready, unsupported, pending, and offline team hosts", () => {
    const hosts = [
      { serverId: "ready", label: "Ready" },
      { serverId: "old", label: "Old" },
      { serverId: "pending", label: "Pending" },
      { serverId: "offline", label: "Offline" },
    ];
    const classified = classifyTeamHosts({
      hosts,
      connectionStatuses: new Map([
        ["ready", "online"],
        ["old", "online"],
        ["pending", "connecting"],
        ["offline", "offline"],
      ]),
      featureAvailability: new Map([
        ["ready", true],
        ["old", false],
        ["pending", null],
        ["offline", true],
      ]),
    });

    expect(classified).toEqual({
      ready: [hosts[0]],
      unsupported: [hosts[1]],
      pending: [hosts[2]],
      offline: [hosts[3]],
    });
  });

  it("explains an unsupported online host instead of claiming none is connected", () => {
    expect(
      describeUnavailableTeamHosts({
        unsupported: [{ serverId: "old", label: "办公室" }],
        pending: [],
        offline: [{ serverId: "offline", label: "家里" }],
      }),
    ).toBe("办公室 的 Host 版本过旧，请更新 Host 后重试。");
  });

  it("reports no connected host only when every host is offline", () => {
    expect(
      describeUnavailableTeamHosts({
        unsupported: [],
        pending: [],
        offline: [{ serverId: "offline", label: "家里" }],
      }),
    ).toBe("没有已连接的 Host");
  });

  it("surfaces the host request failure instead of dropping it", () => {
    expect(
      formatTeamHostLoadFailure([
        { label: "办公室", error: new Error("Request timeout") },
        { label: "家里", error: "connection closed" },
      ]),
    ).toBe("团队数据加载失败：办公室：Request timeout；家里：connection closed");
  });

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

  it("builds inclusive calendar ranges for the client date picker", () => {
    const range = createTeamDateRange(7, new Date(2026, 10, 13, 12).getTime());
    expect(range).toEqual({
      startDate: "2026-11-07",
      endDate: "2026-11-13",
      days: 7,
    });
    expect(formatTeamDateRange(range)).toBe("2026.11.07–11.13 · 7 天");
    expect(
      buildTeamInsightsRequestForRange({
        range,
        timeZone: "Asia/Shanghai",
      }),
    ).toEqual({
      start: new Date("2026-11-07T00:00:00").toISOString(),
      end: new Date(new Date("2026-11-13T00:00:00").getTime() + 86_400_000 - 1).toISOString(),
      timeZone: "Asia/Shanghai",
    });
  });

  it("lists members with the unassigned bucket and preserves a valid selection", () => {
    expect(listTeamMembers(team).map((entry) => entry.name)).toEqual(["书记", "未分配"]);
    expect(selectTeamMember(team, "unassigned")?.name).toBe("未分配");
    expect(selectTeamMember(team, "missing")?.name).toBe("书记");
  });

  it("aggregates member usage across named hosts and uses hosts as accounts", () => {
    const merged = mergeTeamInsightsForHosts([
      {
        serverId: "srv_a",
        label: "办公室",
        team: {
          ...team,
          members: [
            {
              ...member,
              seconds: 300,
              accounts: [],
              projects: [{ key: "a", label: "见山", seconds: 300, share: 1 }],
              sessionDistribution: [
                { key: "session_1", label: "同一会话编号", seconds: 300, share: 1 },
              ],
            },
          ],
        },
      },
      {
        serverId: "srv_b",
        label: "家里",
        team: {
          ...team,
          members: [
            {
              ...member,
              seconds: 180,
              accounts: [],
              projects: [{ key: "a", label: "见山", seconds: 180, share: 1 }],
              sessionDistribution: [
                { key: "session_1", label: "同一会话编号", seconds: 180, share: 1 },
              ],
            },
          ],
        },
      },
    ]);

    expect(merged?.members[0]?.seconds).toBe(480);
    expect(merged?.members[0]?.accounts.map((row) => [row.label, row.seconds])).toEqual([
      ["办公室", 300],
      ["家里", 180],
    ]);
    expect(merged?.members[0]?.projects).toEqual([
      { key: "见山", label: "见山", seconds: 480, share: 1 },
    ]);
    expect(merged?.members[0]?.sessionDistribution).toHaveLength(2);
    expect(merged?.members[0]?.sessionDistribution.map((row) => row.seconds)).toEqual([300, 180]);
  });

  it("preserves the role order returned by the admin team API", () => {
    const secondMember = {
      ...member,
      id: "member-b",
      name: "村长",
    };
    const merged = mergeTeamInsightsForHosts([
      {
        serverId: "srv_a",
        label: "办公室",
        team: { ...team, members: [member, secondMember] },
      },
      {
        serverId: "srv_b",
        label: "家里",
        team: { ...team, members: [secondMember, member] },
      },
    ]);

    expect(merged?.members.map((entry) => entry.name)).toEqual(["书记", "村长"]);
  });

  it("keeps virtual members separate while merging hosts", () => {
    const virtualMember = {
      ...member,
      id: "virtual_dream",
      name: "筑梦",
      virtual: true,
      seconds: 300,
    };
    const merged = mergeTeamInsightsForHosts([
      {
        serverId: "srv_a",
        label: "办公室",
        team: { ...team, members: [member, virtualMember] },
      },
      {
        serverId: "srv_b",
        label: "家里",
        team: { ...team, members: [{ ...virtualMember, seconds: 180 }] },
      },
    ]);

    expect(merged?.members).toEqual([
      expect.objectContaining({ id: "role_admin", virtual: false }),
      expect.objectContaining({ id: "virtual_dream", virtual: true, seconds: 480 }),
    ]);
  });

  it("formats the same values and heat levels as the admin page", () => {
    expect(formatTeamDuration(540)).toBe("9 分钟");
    expect(formatTeamDuration(5400)).toBe("1 小时 30 分钟");
    expect(formatTeamNumber(12345)).toContain("1.2");
    expect([0, 120, 300, 600, 900].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});
