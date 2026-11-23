import {
  VIRTUAL_ACTOR_ROLE_NAME,
  isDreamWorkspaceName,
  type AgentActor,
} from "@getpaseo/protocol/agent-actor";

interface WorkspaceOwnerAgent {
  workspaceId?: string;
  createdAt: string | Date;
  createdBy?: AgentActor;
  internal?: boolean;
}

/**
 * Resolve the actor that owns a workspace. New records persist this at creation;
 * the earliest attached agent is only a compatibility fallback for records written
 * before workspace ownership was stored.
 *
 * An existing role name wins. When a legacy dream-prefixed workspace has no role,
 * it falls back to the reserved virtual role; other unnamed records stay unassigned.
 */
export function resolveWorkspaceCreatedBy(input: {
  workspace: {
    workspaceId: string;
    createdBy?: AgentActor;
    displayName?: string | null;
    branch?: string | null;
  };
  agents: readonly WorkspaceOwnerAgent[];
}): AgentActor | undefined {
  const dream = isDreamWorkspaceRecord(input.workspace);
  if (input.workspace.createdBy) {
    const clientName = input.workspace.createdBy.clientName?.trim();
    if (clientName) {
      return {
        ...input.workspace.createdBy,
        clientName,
      };
    }
    return dream
      ? {
          clientId: input.workspace.createdBy.clientId,
          clientName: VIRTUAL_ACTOR_ROLE_NAME,
          virtual: true,
        }
      : undefined;
  }

  const ownerAgent = input.agents
    .filter(
      (agent) =>
        !agent.internal &&
        agent.workspaceId === input.workspace.workspaceId &&
        agent.createdBy !== undefined,
    )
    .sort(
      (left, right) => Date.parse(String(left.createdAt)) - Date.parse(String(right.createdAt)),
    )[0];
  const actor = ownerAgent?.createdBy;
  const clientName = actor?.clientName?.trim();
  if (actor && clientName) {
    return { ...actor, clientName };
  }
  return dream
    ? {
        clientId: actor?.clientId ?? "dream",
        clientName: VIRTUAL_ACTOR_ROLE_NAME,
        virtual: true,
      }
    : undefined;
}

/**
 * Ownership for a workspace created by this request. An existing role name wins.
 * Only an unnamed CLI/MCP request for a dream-prefixed workspace may use the
 * reserved virtual role; every other unnamed request is rejected.
 */
export function resolveWorkspaceCreationOwner(input: {
  actor: AgentActor;
  clientType: "mobile" | "browser" | "cli" | "mcp" | "hub";
  callerAgent?: { createdBy?: AgentActor } | null;
  workspaceName?: string | null;
}): AgentActor {
  const sourceActor = input.callerAgent?.createdBy ?? input.actor;
  const clientName = sourceActor.clientName?.trim();
  if (clientName) {
    return {
      clientId: sourceActor.clientId,
      clientName,
      ...(input.callerAgent ? { virtual: true } : {}),
    };
  }
  if (
    (input.clientType === "cli" || input.clientType === "mcp") &&
    isDreamWorkspaceName(input.workspaceName)
  ) {
    return {
      clientId: sourceActor.clientId,
      clientName: VIRTUAL_ACTOR_ROLE_NAME,
      virtual: true,
    };
  }
  throw new Error("请联系管理员分配角色");
}

export function isDreamWorkspaceRecord(workspace: {
  displayName?: string | null;
  branch?: string | null;
}): boolean {
  return isDreamWorkspaceName(workspace.displayName) || isDreamWorkspaceName(workspace.branch);
}
