import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { AgentActorSchema } from "@getpaseo/protocol/agent-actor";
import type { AgentUsage } from "@getpaseo/protocol/agent-types";

import { writeJsonFileAtomic } from "../atomic-file.js";

const AGENT_USAGE_LEDGER_VERSION = 1;

const AgentUsageSchema = z
  .object({
    inputTokens: z.number().nonnegative().optional(),
    cachedInputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    totalCostUsd: z.number().nonnegative().optional(),
    contextWindowMaxTokens: z.number().nonnegative().optional(),
    contextWindowUsedTokens: z.number().nonnegative().optional(),
  })
  .strict();

export const AgentUsageLedgerEntrySchema = z
  .object({
    turnId: z.string().min(1),
    clientMessageId: z.string().min(1).optional(),
    actor: AgentActorSchema,
    provider: z.string().min(1),
    model: z.string().nullable().optional(),
    startedAt: z.string(),
    completedAt: z.string(),
    usage: AgentUsageSchema,
  })
  .strict();

const AgentUsageLedgerFileSchema = z
  .object({
    version: z.literal(AGENT_USAGE_LEDGER_VERSION),
    entries: z.array(AgentUsageLedgerEntrySchema),
  })
  .strict();

export type AgentUsageLedgerEntry = z.infer<typeof AgentUsageLedgerEntrySchema>;

export interface RecordAgentUsageInput extends AgentUsageLedgerEntry {
  agentId: string;
}

export interface AgentUsageLedger {
  record(input: RecordAgentUsageInput): Promise<void>;
  list(agentId: string): Promise<readonly AgentUsageLedgerEntry[]>;
  listAll(): Promise<readonly (AgentUsageLedgerEntry & { agentId: string })[]>;
  flush(): Promise<void>;
}

export class InMemoryAgentUsageLedger implements AgentUsageLedger {
  private readonly entriesByAgent = new Map<string, AgentUsageLedgerEntry[]>();

  async record(input: RecordAgentUsageInput): Promise<void> {
    const entries = this.entriesByAgent.get(input.agentId) ?? [];
    const { agentId: _agentId, ...entry } = input;
    void _agentId;
    const existingIndex = entries.findIndex((candidate) => candidate.turnId === entry.turnId);
    if (existingIndex === -1) {
      entries.push(entry);
    } else {
      entries[existingIndex] = entry;
    }
    this.entriesByAgent.set(input.agentId, entries);
  }

  async list(agentId: string): Promise<readonly AgentUsageLedgerEntry[]> {
    return [...(this.entriesByAgent.get(agentId) ?? [])];
  }

  async listAll(): Promise<readonly (AgentUsageLedgerEntry & { agentId: string })[]> {
    return [...this.entriesByAgent.entries()].flatMap(([agentId, entries]) =>
      entries.map((entry) => ({ ...entry, agentId })),
    );
  }

  async flush(): Promise<void> {}
}

export class FileAgentUsageLedger extends InMemoryAgentUsageLedger {
  private readonly loaded = new Set<string>();
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {
    super();
  }

  override async record(input: RecordAgentUsageInput): Promise<void> {
    await this.ensureLoaded(input.agentId);
    await super.record(input);
    await this.persist(input.agentId);
  }

  override async list(agentId: string): Promise<readonly AgentUsageLedgerEntry[]> {
    await this.ensureLoaded(agentId);
    return super.list(agentId);
  }

  override async listAll(): Promise<readonly (AgentUsageLedgerEntry & { agentId: string })[]> {
    const agents = await this.listAgentIds();
    await Promise.all(agents.map((agentId) => this.ensureLoaded(agentId)));
    return super.listAll();
  }

  override async flush(): Promise<void> {
    await Promise.allSettled(this.writes.values());
  }

  private async ensureLoaded(agentId: string): Promise<void> {
    if (this.loaded.has(agentId)) return;
    const raw = await fs.readFile(this.filePath(agentId), "utf8").catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    });
    if (raw !== null) {
      const parsed = AgentUsageLedgerFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(`Invalid agent usage ledger for ${agentId}: ${parsed.error.message}`);
      }
      for (const entry of parsed.data.entries) {
        await super.record({ ...entry, agentId });
      }
    }
    this.loaded.add(agentId);
  }

  private persist(agentId: string): Promise<void> {
    const previous = this.writes.get(agentId) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        const entries = await super.list(agentId);
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        await writeJsonFileAtomic(this.filePath(agentId), {
          version: AGENT_USAGE_LEDGER_VERSION,
          entries,
        });
        return undefined;
      })
      .finally(() => {
        if (this.writes.get(agentId) === task) this.writes.delete(agentId);
      });
    this.writes.set(agentId, task);
    return task;
  }

  private async listAgentIds(): Promise<string[]> {
    const entries = await fs.readdir(this.directory, { withFileTypes: true }).catch((error) => {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      throw error;
    });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.basename(entry.name, ".json"));
  }

  private filePath(agentId: string): string {
    return path.join(this.directory, `${agentId}.json`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

export type { AgentUsage };
