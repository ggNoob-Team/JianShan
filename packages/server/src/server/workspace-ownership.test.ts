import { describe, expect, test } from "vitest";
import { resolveWorkspaceCreatedBy, resolveWorkspaceCreationOwner } from "./workspace-ownership.js";

describe("workspace ownership", () => {
  test("keeps a named client as a normal workspace owner", () => {
    expect(
      resolveWorkspaceCreationOwner({
        actor: { clientId: "mobile-client", clientName: "书记" },
        clientType: "mobile",
        workspaceName: "feature/login",
      }),
    ).toEqual({ clientId: "mobile-client", clientName: "书记" });
  });

  test("assigns dream-prefixed workspaces to the fixed virtual role without a client name", () => {
    expect(
      resolveWorkspaceCreationOwner({
        actor: { clientId: "dream-client" },
        clientType: "cli",
        workspaceName: "dream/20261120-task",
      }),
    ).toEqual({ clientId: "dream-client", clientName: "筑梦", virtual: true });
  });

  test("prefers an existing role name over the dream fallback", () => {
    expect(
      resolveWorkspaceCreationOwner({
        actor: { clientId: "cli-client", clientName: "书记" },
        clientType: "cli",
        workspaceName: "dream/20261120-task",
      }),
    ).toEqual({ clientId: "cli-client", clientName: "书记" });
  });

  test("rejects a non-dream workspace without a client name", () => {
    expect(() =>
      resolveWorkspaceCreationOwner({
        actor: { clientId: "unnamed-client" },
        clientType: "cli",
        workspaceName: "feature/login",
      }),
    ).toThrow("请联系管理员分配角色");
  });

  test("keeps the caller role for a non-dream agent-created workspace", () => {
    expect(
      resolveWorkspaceCreationOwner({
        actor: { clientId: "viewer", clientName: "少爷" },
        clientType: "mobile",
        workspaceName: "feature/login",
        callerAgent: { createdBy: { clientId: "agent-client", clientName: "书记" } },
      }),
    ).toEqual({ clientId: "agent-client", clientName: "书记", virtual: true });
  });

  test("keeps a caller role on a dream workspace when the role is present", () => {
    expect(
      resolveWorkspaceCreationOwner({
        actor: { clientId: "viewer", clientName: "少爷" },
        clientType: "mobile",
        workspaceName: "dream/20261120-task",
        callerAgent: { createdBy: { clientId: "agent-client", clientName: "书记" } },
      }),
    ).toEqual({ clientId: "agent-client", clientName: "书记", virtual: true });
  });

  test("rejects a non-dream agent-created workspace when the caller has no role", () => {
    expect(() =>
      resolveWorkspaceCreationOwner({
        actor: { clientId: "viewer", clientName: "少爷" },
        clientType: "mobile",
        workspaceName: "feature/login",
        callerAgent: { createdBy: { clientId: "agent-client" } },
      }),
    ).toThrow("请联系管理员分配角色");
  });

  test("rejects an unnamed mobile client even for a dream workspace", () => {
    expect(() =>
      resolveWorkspaceCreationOwner({
        actor: { clientId: "unnamed-mobile" },
        clientType: "mobile",
        workspaceName: "dream/20261120-task",
      }),
    ).toThrow("请联系管理员分配角色");
  });

  test("allows an unnamed MCP caller to create a dream workspace", () => {
    expect(
      resolveWorkspaceCreationOwner({
        actor: { clientId: "viewer" },
        clientType: "mcp",
        callerAgent: { createdBy: { clientId: "agent-client" } },
        workspaceName: "dream/20261120-task",
      }),
    ).toEqual({ clientId: "agent-client", clientName: "筑梦", virtual: true });
  });

  test("recognizes a legacy dream workspace from its immutable display name", () => {
    expect(
      resolveWorkspaceCreatedBy({
        workspace: { displayName: "dream/dream-20261120093744-6fb64766" },
        agents: [
          {
            workspaceId: "wks_legacy",
            createdAt: "2026-11-20T09:38:02.264Z",
            createdBy: { clientId: "legacy-client" },
          },
        ],
      }),
    ).toEqual({ clientId: "legacy-client", clientName: "筑梦", virtual: true });
  });

  test("keeps a named legacy role on a dream workspace", () => {
    expect(
      resolveWorkspaceCreatedBy({
        workspace: { displayName: "dream/dream-20261120093744-6fb64766" },
        agents: [
          {
            workspaceId: "wks_dream_named",
            createdAt: "2026-11-20T09:38:02.264Z",
            createdBy: { clientId: "named-client", clientName: "书记" },
          },
        ],
      }),
    ).toEqual({ clientId: "named-client", clientName: "书记" });
  });

  test("keeps a named legacy human role unchanged", () => {
    expect(
      resolveWorkspaceCreatedBy({
        workspace: { displayName: "feature/login" },
        agents: [
          {
            workspaceId: "wks_human",
            createdAt: "2026-11-20T09:38:02.264Z",
            createdBy: { clientId: "mobile-client", clientName: "书记" },
          },
        ],
      }),
    ).toEqual({ clientId: "mobile-client", clientName: "书记" });
  });

  test("does not invent a role for an unnamed non-dream legacy workspace", () => {
    expect(
      resolveWorkspaceCreatedBy({
        workspace: { displayName: "feature/login" },
        agents: [
          {
            workspaceId: "wks_legacy",
            createdAt: "2026-11-20T09:38:02.264Z",
            createdBy: { clientId: "legacy-client" },
          },
        ],
      }),
    ).toBeUndefined();
  });
});
