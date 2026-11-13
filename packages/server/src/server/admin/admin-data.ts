import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  DEFAULT_PAIRING_ROLE,
  resolvePairingRole,
  type AgentActor,
  type PairingRole,
} from "@getpaseo/protocol/agent-actor";
import type { AgentUsage } from "@getpaseo/protocol/agent-types";

export interface AdminAgentRecord {
  id: string;
  provider: string;
  cwd: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  lastUserMessageAt?: string | null;
  title?: string | null;
  labels?: Record<string, string>;
  lastStatus?: string;
  internal?: boolean;
  archivedAt?: string | null;
  createdBy?: AgentActor;
  config?: {
    model?: string | null;
  };
  runtimeInfo?: {
    model?: string | null;
  };
  lastUsage?: AgentUsage;
}

export interface AdminActorEntry {
  clientMessageId: string;
  actor: AgentActor;
  recordedAt: string;
  turnId?: string;
  outcome?: "accepted" | "rejected";
  characters?: number;
}

export interface AdminUsageEntry {
  agentId: string;
  turnId: string;
  actor: AgentActor;
  provider: string;
  model?: string | null;
  startedAt: string;
  completedAt: string;
  usage: AgentUsage;
}

export interface AdminRoleRecord {
  id: string;
  name: string;
  role: PairingRole;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface OwnershipAuditEntry {
  agentId: string;
  from: AgentActor | null;
  to: AgentActor;
  changedAt: string;
  operator: "admin";
}

export interface AdminProjectRecord {
  projectId: string;
  rootPath: string;
  displayName: string;
  customName?: string | null;
  archivedAt?: string | null;
}

export interface AdminWorkspaceRecord {
  workspaceId: string;
  projectId: string;
  cwd: string;
  displayName: string;
  title?: string | null;
  archivedAt?: string | null;
}

export interface AdminSnapshot {
  agents: AdminAgentRecord[];
  actors: Array<AdminActorEntry & { agentId: string }>;
  usages: AdminUsageEntry[];
  roles: AdminRoleRecord[];
  deletedRoleNames: string[];
  ownershipAudit: OwnershipAuditEntry[];
  projects: AdminProjectRecord[];
  workspaces: AdminWorkspaceRecord[];
}

export interface MemberInsights {
  id: string;
  name: string;
  seconds: number;
  sessions: number;
  projects: Array<{ key: string; label: string; seconds: number; share: number }>;
  timeComponents: Array<{ key: string; label: string; seconds: number; share: number }>;
  sessionDistribution: Array<{
    key: string;
    label: string;
    seconds: number;
    share: number;
  }>;
  questionCount: number;
  acceptedQuestionCount: number;
  completedTurns: number;
  tokenDataAvailable: boolean;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  lastActiveAt: string | null;
  heatmap: HeatmapDay[];
}

export interface HeatmapDay {
  date: string;
  slots: number[];
}

export interface TeamInsights {
  generatedAt: string;
  start: string;
  end: string;
  timeZone: string;
  members: MemberInsights[];
  unassigned: MemberInsights;
  summary: {
    totalSeconds: number;
    sessions: number;
    questions: number;
    completedTurns: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
}

export interface TitleMapItem {
  agentId: string;
  workspaceId: string;
  agentTitle: string;
  workspaceTitle: string;
  providerTitle: string;
  ownerName: string;
  ownerSource: "role" | "manual" | "unassigned";
  updatedAt: string;
}

interface ActivityInterval {
  sessionId: string;
  start: number;
  end: number;
  component: "input" | "agent" | "thinking";
}

interface Allocation {
  totalSeconds: number;
  componentSeconds: Record<string, number>;
  sessionSeconds: Record<string, number>;
  projectSeconds: Record<string, number>;
  slices: Array<{ start: number; end: number; sessionIds: string[] }>;
}

const COMPONENT_LABELS: Record<string, string> = {
  input: "输入表达",
  agent: "AI 运行",
  thinking: "思考/阅读",
};

const MIN_INPUT_SECONDS = 30;
const MAX_INPUT_SECONDS = 10 * 60;
const MAX_THINKING_SECONDS = 30 * 60;
const MAX_AGENT_SECONDS = 30 * 60;

export async function loadAdminSnapshot(paseoHome: string): Promise<AdminSnapshot> {
  const [agents, actors, usages, roleRecords, ownershipAudit, projects, workspaces] =
    await Promise.all([
      loadAgents(path.join(paseoHome, "agents")),
      loadActors(path.join(paseoHome, "agent-actors")),
      loadUsages(path.join(paseoHome, "agent-usage")),
      loadRoleRecords(paseoHome),
      loadOwnershipAudit(paseoHome),
      readJsonArray<AdminProjectRecord>(path.join(paseoHome, "projects", "projects.json")),
      readJsonArray<AdminWorkspaceRecord>(path.join(paseoHome, "projects", "workspaces.json")),
    ]);
  return {
    agents,
    actors,
    usages,
    roles: roleRecords.filter((role) => !role.deletedAt),
    deletedRoleNames: roleRecords.filter((role) => role.deletedAt).map((role) => role.name),
    ownershipAudit,
    projects,
    workspaces,
  };
}

export async function loadRoles(paseoHome: string): Promise<AdminRoleRecord[]> {
  return (await loadRoleRecords(paseoHome)).filter((role) => !role.deletedAt);
}

export async function upsertRole(
  paseoHome: string,
  name: string,
  role: PairingRole = DEFAULT_PAIRING_ROLE,
): Promise<AdminRoleRecord> {
  const normalized = name.trim();
  if (!normalized) throw new Error("角色名称不能为空");
  const roles = await loadRoleRecords(paseoHome);
  const now = new Date().toISOString();
  const existing = roles.find((item) => item.name === normalized);
  const record: AdminRoleRecord = existing
    ? { ...existing, role, deletedAt: null, updatedAt: now }
    : {
        id: roleId(normalized),
        name: normalized,
        role,
        createdAt: now,
        updatedAt: now,
      };
  const next = existing
    ? roles.map((item) => (item.id === record.id ? record : item))
    : [...roles, record];
  await writePrivateJson(resolveRolesPath(paseoHome), next);
  return record;
}

export async function deleteRole(paseoHome: string, id: string, name?: string): Promise<boolean> {
  const roles = await loadRoleRecords(paseoHome);
  const existing = roles.find((role) => role.id === id && !role.deletedAt);
  const now = new Date().toISOString();
  if (existing) {
    const next = roles.map((role) =>
      role.id === id ? { ...role, deletedAt: now, updatedAt: now } : role,
    );
    await writePrivateJson(resolveRolesPath(paseoHome), next);
    return true;
  }

  const discoveredName = name?.trim();
  if (!discoveredName) return false;
  const tombstone: AdminRoleRecord = {
    id: roleId(discoveredName),
    name: discoveredName,
    role: DEFAULT_PAIRING_ROLE,
    createdAt: "",
    updatedAt: now,
    deletedAt: now,
  };
  await writePrivateJson(
    resolveRolesPath(paseoHome),
    roles.filter((role) => role.name !== discoveredName).concat(tombstone),
  );
  return true;
}

export async function appendOwnershipAudit(
  paseoHome: string,
  entry: OwnershipAuditEntry,
): Promise<void> {
  const target = resolveOwnershipAuditPath(paseoHome);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.appendFile(target, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

export async function loadOwnershipAudit(paseoHome: string): Promise<OwnershipAuditEntry[]> {
  const raw = await fs.readFile(resolveOwnershipAuditPath(paseoHome), "utf8").catch((error) => {
    if (isNodeError(error) && error.code === "ENOENT") return "";
    throw error;
  });
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line) as unknown;
        return isOwnershipAuditEntry(value) ? [value] : [];
      } catch {
        return [];
      }
    });
}

export function discoverRoles(snapshot: AdminSnapshot): AdminRoleRecord[] {
  const values = new Map<string, AdminRoleRecord>();
  const deleted = new Set(snapshot.deletedRoleNames);
  for (const role of snapshot.roles) values.set(role.name, role);
  const add = (actor: AgentActor | undefined) => {
    const name = actor?.clientName?.trim();
    if (!name || deleted.has(name) || values.has(name)) return;
    values.set(name, {
      id: roleId(name),
      name,
      role: DEFAULT_PAIRING_ROLE,
      createdAt: "",
      updatedAt: "",
    });
  };
  for (const agent of snapshot.agents) add(agent.createdBy);
  for (const actor of snapshot.actors) add(actor.actor);
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export function buildTeamInsights(input: {
  snapshot: AdminSnapshot;
  start: string;
  end: string;
  timeZone?: string;
}): TeamInsights {
  const startMs = Date.parse(input.start);
  const endMs = Date.parse(input.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("无效的统计时间范围");
  }
  const timeZone = validTimeZone(input.timeZone);
  const roles = discoverRoles(input.snapshot);
  const workspaceByAgent = new Map(
    input.snapshot.agents.map((agent) => [agent.id, agent.workspaceId ?? ""]),
  );
  const workspaceById = new Map(
    input.snapshot.workspaces.map((workspace) => [workspace.workspaceId, workspace]),
  );
  const projectById = new Map(
    input.snapshot.projects.map((project) => [project.projectId, project]),
  );
  const projectLabel = (agentId: string) => {
    const workspaceId = workspaceByAgent.get(agentId);
    const workspace = workspaceId ? workspaceById.get(workspaceId) : undefined;
    const project = workspace ? projectById.get(workspace.projectId) : undefined;
    return project?.customName || project?.displayName || workspace?.displayName || "未归属项目";
  };

  const actorsInRange = input.snapshot.actors.filter((entry) => {
    const at = Date.parse(entry.recordedAt);
    return Number.isFinite(at) && at >= startMs && at <= endMs;
  });
  const usageInRange = input.snapshot.usages.filter((entry) => {
    const at = Date.parse(entry.completedAt);
    return Number.isFinite(at) && at >= startMs && at <= endMs;
  });
  const members = roles.map((role) =>
    buildMember({
      id: role.id,
      name: role.name,
      snapshot: input.snapshot,
      actors: actorsInRange.filter((entry) => entry.actor.clientName === role.name),
      usages: usageInRange.filter((entry) => entry.actor.clientName === role.name),
      startMs,
      endMs,
      timeZone,
      projectLabel,
    }),
  );
  const unassigned = buildMember({
    id: "unassigned",
    name: "未分配",
    snapshot: input.snapshot,
    actors: [],
    usages: [],
    startMs,
    endMs,
    timeZone,
    projectLabel,
    unassignedOnly: true,
  });
  const summary = members.reduce(
    (total, member) => ({
      totalSeconds: total.totalSeconds + member.seconds,
      sessions: total.sessions + member.sessions,
      questions: total.questions + member.questionCount,
      completedTurns: total.completedTurns + member.completedTurns,
      inputTokens: total.inputTokens + member.inputTokens,
      cachedInputTokens: total.cachedInputTokens + member.cachedInputTokens,
      outputTokens: total.outputTokens + member.outputTokens,
      totalCostUsd: total.totalCostUsd + member.totalCostUsd,
    }),
    {
      totalSeconds: 0,
      sessions: 0,
      questions: 0,
      completedTurns: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    },
  );
  summary.sessions += unassigned.sessions;
  return {
    generatedAt: new Date().toISOString(),
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    timeZone,
    members,
    unassigned,
    summary,
  };
}

export function buildTitleMap(snapshot: AdminSnapshot): TitleMapItem[] {
  const workspaces = new Map(snapshot.workspaces.map((item) => [item.workspaceId, item]));
  const manualAgentIds = new Set(snapshot.ownershipAudit.map((item) => item.agentId));
  return snapshot.agents
    .filter((agent) => !agent.internal)
    .map((agent) => {
      const workspace = agent.workspaceId ? workspaces.get(agent.workspaceId) : undefined;
      const ownerName = agent.createdBy?.clientName?.trim() ?? "";
      let ownerSource: TitleMapItem["ownerSource"] = "unassigned";
      if (ownerName) {
        ownerSource = manualAgentIds.has(agent.id) ? "manual" : "role";
      }
      return {
        agentId: agent.id,
        workspaceId: agent.workspaceId ?? "",
        agentTitle: agent.title?.trim() ?? "",
        workspaceTitle: workspace?.title?.trim() || workspace?.displayName?.trim() || "",
        providerTitle: agent.title?.trim() ?? "",
        ownerName: ownerName || "未分配",
        ownerSource,
        updatedAt: agent.lastActivityAt ?? agent.updatedAt,
      } satisfies TitleMapItem;
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function buildMember(input: {
  id: string;
  name: string;
  snapshot: AdminSnapshot;
  actors: Array<AdminActorEntry & { agentId: string }>;
  usages: AdminUsageEntry[];
  startMs: number;
  endMs: number;
  timeZone: string;
  projectLabel: (agentId: string) => string;
  unassignedOnly?: boolean;
}): MemberInsights {
  const agentById = new Map(input.snapshot.agents.map((agent) => [agent.id, agent]));
  const ownedSessions = input.snapshot.agents.filter((agent) => {
    if (agent.internal) return false;
    const updated = Date.parse(agent.lastActivityAt ?? agent.updatedAt);
    const created = Date.parse(agent.createdAt);
    if (updated < input.startMs || created > input.endMs) return false;
    if (input.unassignedOnly) return !agent.createdBy?.clientName;
    return agent.createdBy?.clientName === input.name;
  });
  const intervals = buildIntervals(
    input.actors,
    input.usages,
    agentById,
    input.startMs,
    input.endMs,
  );
  const allocation = allocateIntervals(intervals, input.startMs, input.endMs);
  const projects = new Map<string, number>();
  for (const [sessionId, seconds] of Object.entries(allocation.sessionSeconds)) {
    const label = input.projectLabel(sessionId);
    projects.set(label, (projects.get(label) ?? 0) + seconds);
  }
  const usage = input.usages.reduce(
    (total, entry) => ({
      inputTokens: total.inputTokens + (entry.usage.inputTokens ?? 0),
      cachedInputTokens: total.cachedInputTokens + (entry.usage.cachedInputTokens ?? 0),
      outputTokens: total.outputTokens + (entry.usage.outputTokens ?? 0),
      totalCostUsd: total.totalCostUsd + (entry.usage.totalCostUsd ?? 0),
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
  );
  const recordedTurns = new Set(input.usages.map((entry) => `${entry.agentId}:${entry.turnId}`))
    .size;
  const acceptedQuestionCount = input.actors.filter((entry) => entry.outcome !== "rejected").length;
  return {
    id: input.id,
    name: input.name,
    seconds: allocation.totalSeconds,
    sessions: ownedSessions.length,
    projects: bucketEntries(Object.fromEntries(projects), allocation.totalSeconds),
    timeComponents: Object.entries(allocation.componentSeconds)
      .map(([key, seconds]) => ({
        key,
        label: COMPONENT_LABELS[key] ?? key,
        seconds,
        share: allocation.totalSeconds ? seconds / allocation.totalSeconds : 0,
      }))
      .filter((entry) => entry.seconds > 0)
      .sort((left, right) => right.seconds - left.seconds),
    sessionDistribution: bucketEntries(allocation.sessionSeconds, allocation.totalSeconds)
      .map((entry) => ({
        key: entry.key,
        label: agentById.get(entry.key)?.title?.trim() || entry.key.slice(0, 8),
        seconds: entry.seconds,
        share: entry.share,
      }))
      .slice(0, 10),
    questionCount: input.actors.length,
    acceptedQuestionCount: input.actors.filter((entry) => entry.outcome !== "rejected").length,
    completedTurns: recordedTurns || acceptedQuestionCount,
    tokenDataAvailable: recordedTurns > 0,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: usage.totalCostUsd,
    lastActiveAt:
      [
        ...input.actors.map((entry) => entry.recordedAt),
        ...input.usages.map((entry) => entry.completedAt),
      ]
        .sort()
        .at(-1) ?? null,
    heatmap: buildHeatmap(allocation.slices, input.startMs, input.endMs, input.timeZone),
  };
}

// Keeping interval construction together preserves the dependency between a prompt,
// its completed turn and the following thinking window.
// oxlint-disable-next-line complexity
function buildIntervals(
  actors: Array<AdminActorEntry & { agentId: string }>,
  usages: AdminUsageEntry[],
  agentById: Map<string, AdminAgentRecord>,
  startMs: number,
  endMs: number,
): ActivityInterval[] {
  const usageByTurn = new Map(usages.map((entry) => [`${entry.agentId}:${entry.turnId}`, entry]));
  const actorsByAgent = new Map<string, Array<AdminActorEntry & { agentId: string }>>();
  for (const actor of actors) {
    const entries = actorsByAgent.get(actor.agentId) ?? [];
    entries.push(actor);
    actorsByAgent.set(actor.agentId, entries);
  }
  const intervals: ActivityInterval[] = [];
  for (const [agentId, entries] of actorsByAgent) {
    entries.sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const at = Date.parse(entry.recordedAt);
      if (!entry || !Number.isFinite(at)) continue;
      const inputSeconds = estimateInputSeconds(entry.characters ?? 0);
      intervals.push({
        sessionId: agentId,
        start: Math.max(startMs, at - inputSeconds * 1_000),
        end: Math.min(endMs, at),
        component: "input",
      });
      const usage = entry.turnId ? usageByTurn.get(`${agentId}:${entry.turnId}`) : undefined;
      const nextAt =
        index + 1 < entries.length ? Date.parse(entries[index + 1]?.recordedAt ?? "") : endMs;
      const agentUpdatedAt = Date.parse(
        agentById.get(agentId)?.lastActivityAt ??
          agentById.get(agentId)?.updatedAt ??
          entry.recordedAt,
      );
      const completedAt = usage ? Date.parse(usage.completedAt) : Number.NaN;
      const finishAt = Number.isFinite(completedAt)
        ? completedAt
        : Math.min(
            Number.isFinite(nextAt) ? nextAt : endMs,
            Number.isFinite(agentUpdatedAt) ? agentUpdatedAt : endMs,
          );
      const agentEnd = Math.max(at, Math.min(endMs, finishAt, at + MAX_AGENT_SECONDS * 1_000));
      if (agentEnd > at) {
        intervals.push({ sessionId: agentId, start: at, end: agentEnd, component: "agent" });
      }
      if (index + 1 < entries.length && Number.isFinite(nextAt)) {
        const nextEntry = entries[index + 1];
        const nextInput = estimateInputSeconds(nextEntry?.characters ?? 0);
        const thinkingStart = agentEnd;
        const thinkingEnd = Math.min(
          nextAt - nextInput * 1_000,
          agentEnd + MAX_THINKING_SECONDS * 1_000,
        );
        if (thinkingEnd > thinkingStart) {
          intervals.push({
            sessionId: agentId,
            start: thinkingStart,
            end: thinkingEnd,
            component: "thinking",
          });
        }
      }
    }
  }
  return intervals;
}

function allocateIntervals(
  intervals: ActivityInterval[],
  startMs: number,
  endMs: number,
): Allocation {
  if (intervals.length === 0) {
    return {
      totalSeconds: 0,
      componentSeconds: {},
      sessionSeconds: {},
      projectSeconds: {},
      slices: [],
    };
  }
  const boundaries = [
    ...new Set([startMs, endMs, ...intervals.flatMap((entry) => [entry.start, entry.end])]),
  ]
    .filter((value) => value >= startMs && value <= endMs)
    .sort((left, right) => left - right);
  const componentSeconds: Record<string, number> = {};
  const sessionSeconds: Record<string, number> = {};
  const slices: Allocation["slices"] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index]!;
    const right = boundaries[index + 1]!;
    if (right <= left) continue;
    const active = intervals.filter((entry) => entry.start < right && entry.end > left);
    if (active.length === 0) continue;
    const bySession = new Map<string, Set<string>>();
    for (const entry of active) {
      const components = bySession.get(entry.sessionId) ?? new Set<string>();
      components.add(entry.component);
      bySession.set(entry.sessionId, components);
    }
    const duration = (right - left) / 1_000;
    const sessionShare = duration / bySession.size;
    for (const [sessionId, components] of bySession) {
      sessionSeconds[sessionId] = (sessionSeconds[sessionId] ?? 0) + sessionShare;
      const componentShare = sessionShare / components.size;
      for (const component of components) {
        componentSeconds[component] = (componentSeconds[component] ?? 0) + componentShare;
      }
    }
    slices.push({ start: left, end: right, sessionIds: [...bySession.keys()] });
  }
  const roundedSessionSeconds = roundRecord(sessionSeconds);
  const totalSeconds = Object.values(roundedSessionSeconds).reduce(
    (total, value) => total + value,
    0,
  );
  const roundedComponents = roundRecord(componentSeconds);
  reconcileRounding(roundedComponents, totalSeconds);
  return {
    totalSeconds,
    componentSeconds: roundedComponents,
    sessionSeconds: roundedSessionSeconds,
    projectSeconds: {},
    slices,
  };
}

function buildHeatmap(
  slices: Allocation["slices"],
  startMs: number,
  endMs: number,
  timeZone: string,
): HeatmapDay[] {
  const slotMs = 15 * 60_000;
  const values = new Map<string, number[]>();
  const dayKeys = enumerateDays(startMs, endMs, timeZone);
  for (const day of dayKeys)
    values.set(
      day,
      Array.from({ length: 96 }, () => 0),
    );
  for (const slice of slices) {
    let cursor = slice.start;
    while (cursor < slice.end) {
      const parts = zonedParts(cursor, timeZone);
      const slot = Math.floor((parts.hour * 60 + parts.minute) / 15);
      const next = Math.min(
        slice.end,
        cursor + slotMs - ((parts.minute % 15) * 60_000 + parts.second * 1_000),
      );
      const slots = values.get(parts.date);
      if (slots)
        slots[slot] = (slots[slot] ?? 0) + Math.max(0, Math.round((next - cursor) / 1_000));
      cursor = Math.max(cursor + 1_000, next);
    }
  }
  return [...values.entries()].map(([date, slots]) => ({ date, slots }));
}

function enumerateDays(startMs: number, endMs: number, timeZone: string): string[] {
  const days: string[] = [];
  let cursor = startMs;
  let last = "";
  while (cursor <= endMs) {
    const date = zonedParts(cursor, timeZone).date;
    if (date !== last) {
      days.push(date);
      last = date;
    }
    cursor += 60 * 60_000;
  }
  return days;
}

function zonedParts(
  timestamp: number,
  timeZone: string,
): { date: string; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    date: `${value("year").toString().padStart(4, "0")}-${value("month")
      .toString()
      .padStart(2, "0")}-${value("day").toString().padStart(2, "0")}`,
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function estimateInputSeconds(characters: number): number {
  return Math.max(
    MIN_INPUT_SECONDS,
    Math.min(MAX_INPUT_SECONDS, Math.round(Math.max(0, characters) / 2)),
  );
}

function bucketEntries(values: Record<string, number>, totalSeconds: number) {
  return Object.entries(values)
    .filter(([, seconds]) => seconds > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([key, seconds]) => ({
      key,
      label: key,
      seconds,
      share: totalSeconds ? seconds / totalSeconds : 0,
    }));
}

function roundRecord(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, seconds]) => [key, Math.round(seconds)] as const)
      .filter(([, seconds]) => seconds > 0),
  );
}

function reconcileRounding(values: Record<string, number>, total: number): void {
  const current = Object.values(values).reduce((sum, value) => sum + value, 0);
  const delta = total - current;
  if (delta === 0 || Object.keys(values).length === 0) return;
  const largest = Object.entries(values).sort((left, right) => right[1] - left[1])[0]?.[0];
  if (largest) values[largest] = Math.max(0, (values[largest] ?? 0) + delta);
}

function validTimeZone(value: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
}

function roleId(name: string): string {
  return `role_${createHash("sha256").update(name).digest("hex").slice(0, 16)}`;
}

async function loadRoleRecords(paseoHome: string): Promise<AdminRoleRecord[]> {
  const roles = await readJsonArray<AdminRoleRecord>(resolveRolesPath(paseoHome));
  const normalized = roles.filter(
    (role) => typeof role.id === "string" && typeof role.name === "string",
  );
  for (const role of normalized) role.role = resolvePairingRole(role.role);
  return normalized;
}

function resolveRolesPath(paseoHome: string): string {
  return path.join(paseoHome, "admin", "roles.json");
}

function resolveOwnershipAuditPath(paseoHome: string): string {
  return path.join(paseoHome, "admin", "ownership-audit.jsonl");
}

async function loadAgents(directory: string): Promise<AdminAgentRecord[]> {
  const files = await listJsonFiles(directory);
  const values = await Promise.all(
    files.map(async (file) => {
      const value = await readJson(file);
      return isObject(value) && typeof value.id === "string" && typeof value.cwd === "string"
        ? (value as unknown as AdminAgentRecord)
        : null;
    }),
  );
  return values.filter((value): value is AdminAgentRecord => value !== null);
}

async function loadActors(
  directory: string,
): Promise<Array<AdminActorEntry & { agentId: string }>> {
  const files = await listJsonFiles(directory);
  const values = await Promise.all(
    files.map(async (file) => {
      const value = await readJson(file);
      if (!isObject(value) || !Array.isArray(value.entries)) return [];
      const agentId = path.basename(file, ".json");
      return value.entries.flatMap((entry) => {
        if (
          !isObject(entry) ||
          !isObject(entry.actor) ||
          typeof entry.actor.clientId !== "string" ||
          typeof entry.recordedAt !== "string"
        ) {
          return [];
        }
        return [{ ...(entry as unknown as AdminActorEntry), agentId }];
      });
    }),
  );
  return values.flat();
}

async function loadUsages(directory: string): Promise<AdminUsageEntry[]> {
  const files = await listJsonFiles(directory);
  const values = await Promise.all(
    files.map(async (file) => {
      const value = await readJson(file);
      if (!isObject(value) || !Array.isArray(value.entries)) return [];
      const agentId = path.basename(file, ".json");
      return value.entries.flatMap((entry) => {
        if (
          !isObject(entry) ||
          !isObject(entry.actor) ||
          !isObject(entry.usage) ||
          typeof entry.turnId !== "string" ||
          typeof entry.startedAt !== "string" ||
          typeof entry.completedAt !== "string"
        ) {
          return [];
        }
        return [{ ...(entry as unknown as AdminUsageEntry), agentId }];
      });
    }),
  );
  return values.flat();
}

async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(target)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
  }
  return files;
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  const value = await readJson(filePath);
  return Array.isArray(value) ? (value as T[]) : [];
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await fs.rename(temporary, filePath);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOwnershipAuditEntry(value: unknown): value is OwnershipAuditEntry {
  return (
    isObject(value) &&
    typeof value.agentId === "string" &&
    typeof value.changedAt === "string" &&
    isObject(value.to) &&
    typeof value.to.clientId === "string"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
