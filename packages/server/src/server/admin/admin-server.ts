// Express 4 does not catch async handler rejections. Every handler below wraps
// its body in try/catch and forwards failures to the JSON error middleware.
// oxlint-disable no-async-endpoint-handlers
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { homedir } from "node:os";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import * as QRCode from "qrcode";
import type { Server } from "node:http";
import type { Logger } from "pino";

import { PairingRoleSchema, type AgentActor } from "@getpaseo/protocol/agent-actor";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";

import {
  appendOwnershipAudit,
  buildTeamInsights,
  buildTitleMap,
  deleteRole,
  discoverRoles,
  loadAdminSnapshot,
  upsertRole,
  type AdminAgentRecord,
  type AdminWorkspaceRecord,
  type AdminProjectRecord,
} from "./admin-data.js";
import {
  clearAdminServerInfo,
  ensureAdminKey,
  formatAdminListen,
  readAdminKeySync,
  resolveAdminListen,
  resolveAdminUiDir,
  resolveAdminUrl,
  setAdminKey,
  writeAdminServerInfo,
  type AdminListen,
} from "./admin-control.js";
import { withAdminDaemonClient } from "./admin-daemon.js";
import {
  readAdminConfig,
  runtimeAdminConfig,
  sanitizeAdminConfig,
  saveAdminConfig,
} from "./admin-settings.js";

interface AdminSession {
  expiresAt: number;
  keyHash: string;
}

export interface AdminServerOptions {
  paseoHome: string;
  listen?: AdminListen;
  logger?: Logger;
}

export interface AdminServerHandle {
  readonly listen: AdminListen;
  readonly url: string;
  close(): Promise<void>;
}

export async function startAdminServer(options: AdminServerOptions): Promise<AdminServerHandle> {
  const listen = options.listen ?? resolveAdminListen();
  await ensureAdminKey(options.paseoHome);
  const sessions = new Map<string, AdminSession>();
  const app = createAdminApp({ paseoHome: options.paseoHome, sessions });
  const server = app.listen(listen.port, listen.host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Admin console did not bind to a TCP address");
  }
  const effectiveListen = { host: listen.host, port: address.port };
  const url = resolveAdminUrl(effectiveListen);
  await writeAdminServerInfo(options.paseoHome, {
    pid: process.pid,
    listen: formatAdminListen(effectiveListen),
    url,
    startedAt: new Date().toISOString(),
  });
  options.logger?.info(
    { listen: formatAdminListen(effectiveListen), url },
    "Admin console listening",
  );
  let closed = false;
  return {
    listen: effectiveListen,
    url,
    close: async () => {
      if (closed) return;
      closed = true;
      await closeServer(server);
      await clearAdminServerInfo(options.paseoHome, process.pid).catch(() => undefined);
    },
  };
}

function createAdminApp(input: {
  paseoHome: string;
  sessions: Map<string, AdminSession>;
}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/session", (req, res) => {
    const candidate = readString(req.body, "key");
    const configuredKey = readAdminKeySync(input.paseoHome);
    if (!candidate || !configuredKey || !matchesKey(candidate, configuredKey)) {
      res.status(401).json({ error: "管理密钥无效" });
      return;
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 12 * 60 * 60_000;
    input.sessions.set(token, { expiresAt, keyHash: keyHash(configuredKey) });
    pruneSessions(input.sessions);
    res.setHeader(
      "Set-Cookie",
      `paseo_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
    );
    res.json({ ok: true });
  });

  app.get("/api/session", (req, res) => {
    res.json({ authenticated: readSession(req, input.sessions, input.paseoHome) !== null });
  });

  app.get("/team", (_req, res) => {
    res.sendFile(path.join(resolveAdminUiDir(), "team.html"));
  });

  app.get("/api/team/public", async (req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      const start = readQueryString(req, "start") ?? startOfDaysAgo(7);
      const end = readQueryString(req, "end") ?? new Date().toISOString();
      const timeZone = readQueryString(req, "timeZone") ?? undefined;
      res.json(buildTeamInsights({ snapshot, start, end, timeZone }));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/session", (req, res) => {
    const token = readSession(req, input.sessions, input.paseoHome);
    if (token) input.sessions.delete(token);
    res.setHeader(
      "Set-Cookie",
      "paseo_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.status(204).end();
  });

  const requireSession = (req: Request, res: Response, next: NextFunction) => {
    if (!readSession(req, input.sessions, input.paseoHome)) {
      res.status(401).json({ error: "需要登录" });
      return;
    }
    next();
  };

  app.use("/api", requireSession);

  app.get("/api/overview", async (_req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      const activeAgents = snapshot.agents.filter((agent) => !agent.internal && !agent.archivedAt);
      const roles = discoverRoles(snapshot);
      const daemon = await withAdminDaemonClient(input.paseoHome, (client) =>
        client.getDaemonStatus({ timeout: 3_000 }),
      );
      res.json({
        daemon,
        counts: {
          agents: activeAgents.length,
          archivedAgents: snapshot.agents.filter((agent) => agent.archivedAt).length,
          roles: roles.length,
          projects: snapshot.projects.filter((project) => !project.archivedAt).length,
          workspaces: snapshot.workspaces.filter((workspace) => !workspace.archivedAt).length,
        },
        roles,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/metadata", async (_req, res, next) => {
    try {
      const result = await withAdminDaemonClient(input.paseoHome, async (client) => {
        const [config, providers] = await Promise.all([
          client.getDaemonConfig(),
          client.getProvidersSnapshot({ cwd: homedir() }).catch(() => null),
        ]);
        const configured = config.config.metadataGeneration.providers[0] ?? null;
        return {
          mode: configured ? "manual" : "automatic",
          provider: configured?.provider ?? null,
          model: configured?.model ?? null,
          providers: providers?.entries.map(toProviderOption) ?? [],
        };
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/metadata/models", async (req, res, next) => {
    try {
      const provider = readQueryString(req, "provider");
      if (!provider) {
        res.status(400).json({ error: "provider 不能为空" });
        return;
      }
      const models = await withAdminDaemonClient(input.paseoHome, (client) =>
        client.listProviderModels(provider as AgentProvider, { cwd: homedir() }),
      );
      res.json({
        models: (models.models ?? []).map((model) => ({ id: model.id, label: model.label })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/metadata", async (req, res, next) => {
    try {
      const mode = readString(req.body, "mode");
      if (mode !== "automatic" && mode !== "manual") {
        res.status(400).json({ error: "模式必须是 automatic 或 manual" });
        return;
      }
      const provider = readString(req.body, "provider");
      const model = readString(req.body, "model");
      if (mode === "manual" && (!provider || !model)) {
        res.status(400).json({ error: "手动模式需要 provider 和 model" });
        return;
      }
      await withAdminDaemonClient(input.paseoHome, (client) =>
        client.patchDaemonConfig({
          metadataGeneration: {
            providers: mode === "manual" ? [{ provider: provider!, model: model! }] : [],
          },
        }),
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings", async (_req, res, next) => {
    try {
      const config = sanitizeAdminConfig(readAdminConfig(input.paseoHome));
      const runtimeConfig = await withAdminDaemonClient(input.paseoHome, async (client) => {
        const current = await client.getDaemonConfig();
        return runtimeAdminConfig(current.config);
      }).catch(() => null);
      res.json({ config, runtimeConfig });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings", async (req, res) => {
    let config: ReturnType<typeof saveAdminConfig>;
    try {
      config = saveAdminConfig(
        input.paseoHome,
        typeof req.body === "object" && req.body !== null && "config" in req.body
          ? (req.body as Record<string, unknown>).config
          : req.body,
      );
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let reload: unknown = null;
    let reloadError: string | null = null;
    try {
      reload = await withAdminDaemonClient(input.paseoHome, (client) =>
        client.reloadDaemonConfig(),
      );
    } catch (error) {
      reloadError = error instanceof Error ? error.message : String(error);
    }
    const runtimeConfig = await withAdminDaemonClient(input.paseoHome, async (client) => {
      const current = await client.getDaemonConfig();
      return runtimeAdminConfig(current.config);
    }).catch(() => null);
    res.json({ ok: true, config, runtimeConfig, reload, reloadError });
  });

  app.post("/api/settings/reload", async (_req, res) => {
    try {
      const reload = await withAdminDaemonClient(input.paseoHome, (client) =>
        client.reloadDaemonConfig(),
      );
      const runtimeConfig = await withAdminDaemonClient(input.paseoHome, async (client) => {
        const current = await client.getDaemonConfig();
        return runtimeAdminConfig(current.config);
      });
      res.json({ ok: true, reload, runtimeConfig });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/settings/admin-key", async (req, res) => {
    const key = readString(req.body, "key");
    if (!key) {
      res.status(400).json({ error: "管理密钥不能为空" });
      return;
    }
    try {
      await setAdminKey(input.paseoHome, key);
      input.sessions.clear();
      res.setHeader(
        "Set-Cookie",
        "paseo_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/roles", async (_req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      res.json({
        roles: discoverRoles(snapshot).map((role) => serializeRole(role, snapshot)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/roles", async (req, res, next) => {
    try {
      const name = readString(req.body, "name");
      if (!name) {
        res.status(400).json({ error: "角色名称不能为空" });
        return;
      }
      const parsedRole = PairingRoleSchema.safeParse(req.body?.role ?? "member");
      if (!parsedRole.success) {
        res.status(400).json({ error: "角色必须是 admin 或 member" });
        return;
      }
      const role = await upsertRole(input.paseoHome, name, parsedRole.data);
      const offer = await withAdminDaemonClient(input.paseoHome, (client) =>
        client.getDaemonPairingOffer({
          clientName: role.name,
          role: role.role,
          timeout: 5_000,
        }),
      );
      if (!offer.relayEnabled || !offer.url) {
        res.status(409).json({
          error: "daemon 未启用 relay，暂时无法生成可扫码的配对链接",
          role,
        });
        return;
      }
      const qr = await QRCode.toDataURL(offer.url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      });
      res.status(201).json({ role, url: offer.url, qr });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/roles/:roleId", async (req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      const discovered = discoverRoles(snapshot).find((role) => role.id === req.params.roleId);
      const removed = await deleteRole(input.paseoHome, req.params.roleId, discovered?.name);
      if (!removed) {
        res.status(404).json({ error: "角色不存在" });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agents", async (_req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      res.json({
        agents: snapshot.agents
          .filter((agent) => !agent.internal)
          .sort(
            (left, right) =>
              Date.parse(right.lastActivityAt ?? right.updatedAt) -
              Date.parse(left.lastActivityAt ?? left.updatedAt),
          )
          .map((agent) => serializeAgent(agent, snapshot.workspaces, snapshot.projects)),
        roles: discoverRoles(snapshot),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agents/:agentId/owner", async (req, res, next) => {
    try {
      const name = readString(req.body, "name");
      if (!name) {
        res.status(400).json({ error: "负责人不能为空" });
        return;
      }
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      const agent = snapshot.agents.find((item) => item.id === req.params.agentId);
      if (!agent) {
        res.status(404).json({ error: "会话不存在" });
        return;
      }
      if (agent.createdBy?.clientName === name) {
        res.status(409).json({ error: "该角色已经是当前负责人" });
        return;
      }
      const targetActor = selectRoleActor(snapshot.actors, name);
      await withAdminDaemonClient(input.paseoHome, (client) =>
        client.updateAgent(agent.id, { createdBy: targetActor }),
      );
      await appendOwnershipAudit(input.paseoHome, {
        agentId: agent.id,
        from: agent.createdBy ?? null,
        to: targetActor,
        changedAt: new Date().toISOString(),
        operator: "admin",
      });
      res.json({ ok: true, createdBy: targetActor });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/team", async (req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      const start = readQueryString(req, "start") ?? startOfDaysAgo(7);
      const end = readQueryString(req, "end") ?? new Date().toISOString();
      const timeZone = readQueryString(req, "timeZone") ?? undefined;
      res.json(buildTeamInsights({ snapshot, start, end, timeZone }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/titles", async (_req, res, next) => {
    try {
      const snapshot = await loadAdminSnapshot(input.paseoHome);
      res.json({ items: buildTitleMap(snapshot) });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(resolveAdminUiDir(), { index: false, maxAge: 0 }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(resolveAdminUiDir(), "index.html"));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  });

  return app;
}

function serializeAgent(
  agent: AdminAgentRecord,
  workspaces: AdminWorkspaceRecord[],
  projects: AdminProjectRecord[],
) {
  const workspace = workspaces.find((item) => item.workspaceId === agent.workspaceId);
  const project = projects.find((item) => item.projectId === workspace?.projectId);
  return {
    id: agent.id,
    title: agent.title?.trim() || "未命名会话",
    provider: agent.provider,
    model: agent.runtimeInfo?.model ?? agent.config?.model ?? null,
    status: agent.lastStatus ?? "closed",
    archived: Boolean(agent.archivedAt),
    ownerName: agent.createdBy?.clientName ?? "未分配",
    projectName:
      project?.customName || project?.displayName || workspace?.displayName || "未归属项目",
    workspaceId: agent.workspaceId ?? "",
    createdAt: agent.createdAt,
    updatedAt: agent.lastActivityAt ?? agent.updatedAt,
  };
}

function toProviderOption(entry: {
  provider: string;
  label?: string;
  models?: Array<{ id: string; label: string }>;
}) {
  return {
    id: entry.provider,
    label: entry.label ?? entry.provider,
    models: (entry.models ?? []).map((model) => ({ id: model.id, label: model.label })),
  };
}

function serializeRole(
  role: ReturnType<typeof discoverRoles>[number],
  snapshot: Awaited<ReturnType<typeof loadAdminSnapshot>>,
) {
  const questions = snapshot.actors.filter((entry) => entry.actor.clientName === role.name);
  return {
    id: role.id,
    name: role.name,
    role: role.role,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    sessions: snapshot.agents.filter((agent) => agent.createdBy?.clientName === role.name).length,
    questions: questions.length,
    lastActiveAt:
      questions
        .map((entry) => entry.recordedAt)
        .sort()
        .at(-1) ?? null,
  };
}

function selectRoleActor(
  actors: Array<{ actor: AgentActor; recordedAt: string }>,
  name: string,
): AgentActor {
  const known = actors
    .filter((entry) => entry.actor.clientName === name)
    .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))[0]?.actor;
  if (known) return known;
  return {
    clientId: `role-${createHash("sha256").update(name).digest("hex").slice(0, 20)}`,
    clientName: name,
  };
}

function readSession(
  req: Request,
  sessions: Map<string, AdminSession>,
  paseoHome: string,
): string | null {
  const token = parseCookies(req.headers.cookie).paseo_admin_session;
  if (!token) return null;
  const session = sessions.get(token);
  const configuredKey = readAdminKeySync(paseoHome);
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    !configuredKey ||
    session.keyHash !== keyHash(configuredKey)
  ) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 12 * 60 * 60_000;
  return token;
}

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function pruneSessions(sessions: Map<string, AdminSession>): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function parseCookies(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(
    value.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [];
      return [
        [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())],
      ];
    }),
  );
}

function matchesKey(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function readQueryString(req: Request, key: string): string | null {
  const value = req.query[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function startOfDaysAgo(days: number): string {
  return new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString();
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
