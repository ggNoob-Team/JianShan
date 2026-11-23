import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildTeamInsights,
  buildTitleMap,
  deleteRole,
  discoverRoles,
  loadAdminSnapshot,
  reorderRoles,
  upsertRole,
} from "./admin-data.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-data-"));
  directories.push(home);
  await Promise.all([
    mkdir(path.join(home, "agents", "project"), { recursive: true }),
    mkdir(path.join(home, "agent-actors"), { recursive: true }),
    mkdir(path.join(home, "agent-usage"), { recursive: true }),
    mkdir(path.join(home, "projects"), { recursive: true }),
    mkdir(path.join(home, "admin"), { recursive: true }),
  ]);
  await writeFile(
    path.join(home, "agents", "project", "agent-1.json"),
    JSON.stringify({
      id: "agent-1",
      provider: "codex",
      cwd: "/workspace/project",
      workspaceId: "wks_1",
      title: "实现管理台",
      createdAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-11-02T00:02:00.000Z",
      lastActivityAt: "2026-11-02T00:02:00.000Z",
      lastStatus: "idle",
      createdBy: { clientId: "client-a", clientName: "书记" },
    }),
  );
  await writeFile(
    path.join(home, "agent-actors", "agent-1.json"),
    JSON.stringify({
      version: 1,
      entries: [
        {
          clientMessageId: "message-1",
          textDigest: "a".repeat(64),
          actor: { clientId: "client-a", clientName: "书记" },
          recordedAt: "2026-11-02T00:00:10.000Z",
          turnId: "turn-1",
          outcome: "accepted",
          characters: 20,
        },
        {
          clientMessageId: "message-2",
          textDigest: "b".repeat(64),
          actor: { clientId: "client-b", clientName: "村长" },
          recordedAt: "2026-11-02T00:01:20.000Z",
          turnId: "turn-2",
          outcome: "accepted",
          characters: 10,
        },
      ],
    }),
  );
  await writeFile(
    path.join(home, "agent-usage", "agent-1.json"),
    JSON.stringify({
      version: 1,
      entries: [
        {
          turnId: "turn-1",
          actor: { clientId: "client-a", clientName: "书记" },
          provider: "codex",
          model: "deepseek-flash",
          startedAt: "2026-11-02T00:00:10.000Z",
          completedAt: "2026-11-02T00:00:40.000Z",
          usage: { inputTokens: 100, outputTokens: 25, totalCostUsd: 0.01 },
        },
      ],
    }),
  );
  await writeFile(
    path.join(home, "projects", "projects.json"),
    JSON.stringify([{ projectId: "prj_1", rootPath: "/workspace/project", displayName: "项目一" }]),
  );
  await writeFile(
    path.join(home, "projects", "workspaces.json"),
    JSON.stringify([
      {
        workspaceId: "wks_1",
        projectId: "prj_1",
        cwd: "/workspace/project",
        displayName: "main",
        title: "管理台工作区",
      },
    ]),
  );
  return home;
}

describe("admin data projection", () => {
  test("persists a role kind and removes deleted roles from discovery", async () => {
    const home = await fixture();
    const admin = await upsertRole(home, "书记", "admin");
    expect(admin).toMatchObject({ name: "书记", role: "admin" });
    expect((await loadAdminSnapshot(home)).roles).toContainEqual(
      expect.objectContaining({ name: "书记", role: "admin" }),
    );

    expect(await deleteRole(home, admin.id)).toBe(true);
    const snapshot = await loadAdminSnapshot(home);
    expect(discoverRoles(snapshot).map((role) => role.name)).not.toContain("书记");
  });

  test("deletes a role that was only discovered from historical activity", async () => {
    const home = await fixture();
    const discovered = discoverRoles(await loadAdminSnapshot(home)).find(
      (role) => role.name === "村长",
    );
    expect(discovered).toBeDefined();

    expect(await deleteRole(home, discovered!.id, discovered!.name)).toBe(true);
    expect(discoverRoles(await loadAdminSnapshot(home)).map((role) => role.name)).not.toContain(
      "村长",
    );
  });

  test("persists a custom role order for the admin and team views", async () => {
    const home = await fixture();
    const before = discoverRoles(await loadAdminSnapshot(home));
    for (const role of before) await upsertRole(home, role.name, role.role);
    const reversedIds = before.map((role) => role.id).toReversed();

    await reorderRoles(home, reversedIds);

    const snapshot = await loadAdminSnapshot(home);
    expect(discoverRoles(snapshot).map((role) => role.id)).toEqual(reversedIds);
    expect(
      buildTeamInsights({
        snapshot,
        start: "2026-11-02T00:00:00.000Z",
        end: "2026-11-02T00:05:00.000Z",
      }).members.map((member) => member.id),
    ).toEqual(reversedIds);
  });

  test("groups questions and usage by pair name while sessions use createdBy", async () => {
    const home = await fixture();
    await upsertRole(home, "书记");
    await upsertRole(home, "村长");
    const snapshot = await loadAdminSnapshot(home);
    const team = buildTeamInsights({
      snapshot,
      start: "2026-11-02T00:00:00.000Z",
      end: "2026-11-02T00:05:00.000Z",
      timeZone: "Asia/Shanghai",
    });

    const secretary = team.members.find((member) => member.name === "书记");
    const owner = team.members.find((member) => member.name === "村长");
    expect(secretary).toMatchObject({
      questionCount: 1,
      acceptedQuestionCount: 1,
      completedTurns: 1,
      sessions: 1,
      inputTokens: 100,
      outputTokens: 25,
      totalCostUsd: 0.01,
    });
    expect(owner).toMatchObject({ questionCount: 1, sessions: 0 });
    expect(secretary?.timeComponents.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["input", "agent"]),
    );
  });

  test("derives title ownership from createdBy and marks it as role assignment", async () => {
    const home = await fixture();
    const snapshot = await loadAdminSnapshot(home);
    expect(buildTitleMap(snapshot)).toEqual([
      expect.objectContaining({
        agentId: "agent-1",
        ownerName: "书记",
        ownerSource: "role",
        ownerVirtual: false,
        workspaceTitle: "管理台工作区",
      }),
    ]);
  });

  test("marks inherited agent ownership as virtual", async () => {
    const home = await fixture();
    const snapshot = await loadAdminSnapshot(home);
    snapshot.agents[0]!.createdBy = {
      clientId: "client-a",
      clientName: "书记",
      virtual: true,
    };

    expect(buildTitleMap(snapshot)[0]).toMatchObject({
      ownerName: "书记",
      ownerVirtual: true,
    });
  });

  test("shows an agent-created workspace without an agent as a virtual title row", async () => {
    const home = await fixture();
    const snapshot = await loadAdminSnapshot(home);
    snapshot.workspaces.push({
      workspaceId: "wks_virtual",
      projectId: "prj_1",
      cwd: "/workspace/virtual",
      displayName: "virtual",
      title: "Agent-created workspace",
      createdBy: { clientId: "client-a", clientName: "书记", virtual: true },
      updatedAt: "2026-11-02T00:03:00.000Z",
    });

    expect(buildTitleMap(snapshot)).toContainEqual(
      expect.objectContaining({
        agentId: "",
        workspaceId: "wks_virtual",
        workspaceTitle: "Agent-created workspace",
        ownerName: "书记",
        ownerSource: "role",
        ownerVirtual: true,
      }),
    );
  });

  test("reports normal and virtual member activity as separate members", async () => {
    const home = await fixture();
    await upsertRole(home, "书记");
    await upsertRole(home, "村长");
    const snapshot = await loadAdminSnapshot(home);
    snapshot.agents[0]!.createdBy = {
      clientId: "client-a",
      clientName: "书记",
      virtual: true,
    };
    snapshot.workspaces[0]!.createdBy = {
      clientId: "client-a",
      clientName: "书记",
      virtual: true,
    };
    snapshot.actors[0]!.actor = {
      clientId: "client-a",
      clientName: "书记",
      virtual: true,
    };
    snapshot.usages[0]!.actor = {
      clientId: "client-a",
      clientName: "书记",
      virtual: true,
    };
    snapshot.workspaces.push({
      workspaceId: "wks_virtual_owner_only",
      projectId: "prj_1",
      cwd: "/workspace/virtual-owner",
      displayName: "virtual owner only",
      createdBy: { clientId: "client-b", clientName: "村长", virtual: true },
      updatedAt: "2026-11-02T00:03:00.000Z",
    });

    const team = buildTeamInsights({
      snapshot,
      start: "2026-11-02T00:00:00.000Z",
      end: "2026-11-02T00:05:00.000Z",
      timeZone: "Asia/Shanghai",
    });

    const normalSecretary = team.members.find(
      (member) => member.name === "书记" && member.virtual !== true,
    );
    const virtualMember = team.members.find(
      (member) => member.name === "书记" && member.virtual === true,
    );
    const virtualOwnerOnly = team.members.find(
      (member) => member.name === "村长" && member.virtual === true,
    );
    expect(normalSecretary).toMatchObject({ sessions: 0, questionCount: 0, virtual: false });
    expect(virtualMember).toMatchObject({
      name: "书记",
      sessions: 1,
      questionCount: 2,
      inputTokens: 100,
      virtual: true,
    });
    expect(virtualOwnerOnly).toMatchObject({ sessions: 0, virtual: true });
    expect(team.members.filter((member) => member.virtual === true)).toHaveLength(2);
    expect(team.summary.sessions).toBe(1);
  });

  test("separates legacy unnamed virtual sessions from normal unassigned sessions", async () => {
    const home = await fixture();
    const snapshot = await loadAdminSnapshot(home);
    snapshot.agents[0]!.createdBy = { clientId: "legacy-cli-client" };
    snapshot.workspaces[0]!.displayName = "dream/dream-20261120093744-6fb64766";
    snapshot.actors[0]!.actor = { clientId: "legacy-cli-client" };
    snapshot.actors[1]!.actor = { clientId: "legacy-cli-client" };
    snapshot.usages[0]!.actor = { clientId: "legacy-cli-client" };

    const team = buildTeamInsights({
      snapshot,
      start: "2026-11-02T00:00:00.000Z",
      end: "2026-11-02T00:05:00.000Z",
      timeZone: "Asia/Shanghai",
    });

    expect(team.members).toContainEqual(
      expect.objectContaining({
        id: "virtual_dream",
        name: "筑梦",
        sessions: 1,
        questionCount: 2,
        virtual: true,
      }),
    );
    expect(team.unassigned).toMatchObject({ sessions: 0, questionCount: 0, virtual: false });
    expect(team.summary.sessions).toBe(1);
  });
});
