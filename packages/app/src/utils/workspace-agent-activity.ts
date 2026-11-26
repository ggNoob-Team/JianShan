import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import { deriveSidebarStateBucket } from "./sidebar-agent-state";

export interface WorkspaceAgentActivity {
  agentId: string;
  status: WorkspaceDescriptor["status"];
  enteredAt: Date | null;
  createdByName: string | null;
  createdByVirtual: boolean;
}

function workspaceAgentStatus(agent: Agent): Agent["status"] {
  if (agent.turn.phase === "open") return "running";
  return agent.status === "running" ? "idle" : agent.status;
}

export function buildWorkspaceAgentActivityIndex(
  agents: ReadonlyMap<string, Agent>,
  previous?: ReadonlyMap<string, WorkspaceAgentActivity>,
): Map<string, WorkspaceAgentActivity> {
  const creatorByWorkspaceId = buildWorkspaceCreators(agents);
  const activityByWorkspaceId = buildLatestWorkspaceActivity(
    agents,
    creatorByWorkspaceId,
    previous,
  );

  for (const [workspaceId, activity] of activityByWorkspaceId) {
    const previousActivity = previous?.get(workspaceId);
    if (
      previousActivity?.agentId === activity.agentId &&
      previousActivity.status === activity.status &&
      previousActivity.createdByName === activity.createdByName &&
      previousActivity.createdByVirtual === activity.createdByVirtual
    ) {
      activityByWorkspaceId.set(workspaceId, previousActivity);
    }
  }

  if (previous && areWorkspaceAgentActivityIndexesIdentical(previous, activityByWorkspaceId)) {
    return previous instanceof Map ? previous : new Map(previous);
  }
  return activityByWorkspaceId;
}

function buildLatestWorkspaceActivity(
  agents: ReadonlyMap<string, Agent>,
  creatorByWorkspaceId: ReadonlyMap<string, { name: string | null; virtual: boolean }>,
  previous?: ReadonlyMap<string, WorkspaceAgentActivity>,
): Map<string, WorkspaceAgentActivity> {
  const activityByWorkspaceId = new Map<string, WorkspaceAgentActivity>();
  const latestActivityAtByWorkspaceId = new Map<string, Date>();

  for (const agent of agents.values()) {
    const parentAgent = agent.parentAgentId ? agents.get(agent.parentAgentId) : undefined;
    if (
      agent.archivedAt ||
      agent.background ||
      !agent.workspaceId ||
      !isWorkspaceRootAgent(agent, parentAgent)
    ) {
      continue;
    }

    const enteredAt = agent.attentionTimestamp ?? agent.updatedAt;
    const latestActivityAt = latestActivityAtByWorkspaceId.get(agent.workspaceId);
    if (latestActivityAt && enteredAt <= latestActivityAt) {
      continue;
    }
    latestActivityAtByWorkspaceId.set(agent.workspaceId, enteredAt);

    const status = deriveSidebarStateBucket({
      status: workspaceAgentStatus(agent),
      backgroundWork: agent.backgroundWork,
      pendingPermissionCount: agent.pendingPermissions.length,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
    });
    activityByWorkspaceId.set(agent.workspaceId, {
      agentId: agent.id,
      status,
      enteredAt,
      createdByName:
        creatorByWorkspaceId.get(agent.workspaceId)?.name ??
        previous?.get(agent.workspaceId)?.createdByName ??
        null,
      createdByVirtual:
        creatorByWorkspaceId.get(agent.workspaceId)?.virtual ??
        previous?.get(agent.workspaceId)?.createdByVirtual ??
        false,
    });
  }
  return activityByWorkspaceId;
}

function buildWorkspaceCreators(
  agents: ReadonlyMap<string, Agent>,
): Map<string, { name: string | null; virtual: boolean }> {
  const creatorByWorkspaceId = new Map<
    string,
    { createdAt: Date; name: string | null; virtual: boolean }
  >();

  // Activity follows the newest root agent, but creator identity belongs to the
  // workspace and must survive later agents that have no actor metadata.
  for (const agent of agents.values()) {
    if (!agent.workspaceId || !agent.createdBy) {
      continue;
    }
    const sourceName = agent.createdBy.clientName?.trim() || null;
    const virtual = agent.createdBy.virtual === true || sourceName === null;
    const name = sourceName;
    const current = creatorByWorkspaceId.get(agent.workspaceId);
    if (!current || agent.createdAt < current.createdAt) {
      creatorByWorkspaceId.set(agent.workspaceId, { createdAt: agent.createdAt, name, virtual });
    }
  }

  return new Map(
    Array.from(creatorByWorkspaceId, ([workspaceId, creator]) => [
      workspaceId,
      { name: creator.name, virtual: creator.virtual },
    ]),
  );
}

function areWorkspaceAgentActivityIndexesIdentical(
  previous: ReadonlyMap<string, WorkspaceAgentActivity>,
  next: ReadonlyMap<string, WorkspaceAgentActivity>,
): boolean {
  if (previous.size !== next.size) {
    return false;
  }
  for (const [workspaceId, activity] of next) {
    if (previous.get(workspaceId) !== activity) {
      return false;
    }
  }
  return true;
}
