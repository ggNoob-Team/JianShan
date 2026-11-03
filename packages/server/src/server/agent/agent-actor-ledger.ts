import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AgentActorSchema, type AgentActor } from "@getpaseo/protocol/agent-actor";

import { writeJsonFileAtomic } from "../atomic-file.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

const AGENT_ACTOR_LEDGER_VERSION = 1;

const AgentActorLedgerEntrySchema = z
  .object({
    clientMessageId: z.string().min(1),
    textDigest: z.string().regex(/^[a-f0-9]{64}$/),
    actor: AgentActorSchema,
    recordedAt: z.string(),
    providerMessageId: z.string().min(1).optional(),
  })
  .strict();

const AgentActorLedgerFileSchema = z
  .object({
    version: z.literal(AGENT_ACTOR_LEDGER_VERSION),
    entries: z.array(AgentActorLedgerEntrySchema),
  })
  .strict();

export type AgentActorLedgerEntry = z.infer<typeof AgentActorLedgerEntrySchema>;

export interface RecordAgentActorInput {
  agentId: string;
  clientMessageId: string;
  text: string;
  actor: AgentActor;
  recordedAt: string;
  providerMessageId?: string;
}

export interface AgentActorLedger {
  record(input: RecordAgentActorInput): Promise<void>;
  setProviderMessageId(
    agentId: string,
    clientMessageId: string,
    providerMessageId: string,
  ): Promise<void>;
  list(agentId: string): Promise<readonly AgentActorLedgerEntry[]>;
  deleteAgent(agentId: string): Promise<void>;
  flush(): Promise<void>;
}

export function digestAgentActorText(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex");
}

export class AgentActorHistoryMatcher {
  private readonly claimed = new Set<string>();
  private readonly byClientMessageId = new Map<string, AgentActorLedgerEntry>();
  private readonly byProviderMessageId = new Map<string, AgentActorLedgerEntry>();
  private readonly byTextDigest = new Map<string, AgentActorLedgerEntry[]>();

  constructor(entries: readonly AgentActorLedgerEntry[]) {
    for (const entry of entries) {
      this.byClientMessageId.set(entry.clientMessageId, entry);
      if (entry.providerMessageId) {
        this.byProviderMessageId.set(entry.providerMessageId, entry);
      }
      const matches = this.byTextDigest.get(entry.textDigest) ?? [];
      matches.push(entry);
      this.byTextDigest.set(entry.textDigest, matches);
    }
  }

  match(item: AgentTimelineItem): AgentTimelineItem {
    if (item.type !== "user_message" || item.actor) {
      return item;
    }
    const entry =
      (item.clientMessageId ? this.byClientMessageId.get(item.clientMessageId) : undefined) ??
      (item.messageId ? this.byProviderMessageId.get(item.messageId) : undefined) ??
      this.takeTextMatch(item.text);
    if (!entry) {
      return item;
    }
    this.claimed.add(entry.clientMessageId);
    return { ...item, actor: entry.actor };
  }

  private takeTextMatch(text: string): AgentActorLedgerEntry | undefined {
    const matches = this.byTextDigest.get(digestAgentActorText(text));
    if (!matches) return undefined;
    const match = matches.find((entry) => !this.claimed.has(entry.clientMessageId));
    if (!match) return undefined;
    this.claimed.add(match.clientMessageId);
    return match;
  }
}

export class InMemoryAgentActorLedger implements AgentActorLedger {
  private readonly entriesByAgent = new Map<string, AgentActorLedgerEntry[]>();

  async record(input: RecordAgentActorInput): Promise<void> {
    this.recordForAgent(input.agentId, input);
  }

  async setProviderMessageId(
    agentId: string,
    clientMessageId: string,
    providerMessageId: string,
  ): Promise<void> {
    this.setProviderMessageIdForAgent(agentId, clientMessageId, providerMessageId);
  }

  async list(agentId: string): Promise<readonly AgentActorLedgerEntry[]> {
    return [...(this.entriesByAgent.get(agentId) ?? [])];
  }

  async deleteAgent(agentId: string): Promise<void> {
    this.entriesByAgent.delete(agentId);
  }

  async flush(): Promise<void> {}

  protected recordForAgent(agentId: string, input: RecordAgentActorInput): AgentActorLedgerEntry {
    const entries = this.entriesByAgent.get(agentId) ?? [];
    const existing = entries.find((entry) => entry.clientMessageId === input.clientMessageId);
    if (existing) {
      if (!existing.providerMessageId && input.providerMessageId) {
        existing.providerMessageId = input.providerMessageId;
      }
      return existing;
    }
    const entry: AgentActorLedgerEntry = {
      clientMessageId: input.clientMessageId,
      textDigest: digestAgentActorText(input.text),
      actor: input.actor,
      recordedAt: input.recordedAt,
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    };
    entries.push(entry);
    this.entriesByAgent.set(agentId, entries);
    return entry;
  }

  protected setProviderMessageIdForAgent(
    agentId: string,
    clientMessageId: string,
    providerMessageId: string,
  ): boolean {
    const entry = this.entriesByAgent
      .get(agentId)
      ?.find((candidate) => candidate.clientMessageId === clientMessageId);
    if (!entry || entry.providerMessageId === providerMessageId) {
      return false;
    }
    entry.providerMessageId = providerMessageId;
    return true;
  }

  protected replaceEntries(agentId: string, entries: readonly AgentActorLedgerEntry[]): void {
    this.entriesByAgent.set(
      agentId,
      entries.map((entry) => ({ ...entry })),
    );
  }
}

export class FileAgentActorLedger extends InMemoryAgentActorLedger {
  private readonly loaded = new Set<string>();
  private readonly loadTasks = new Map<string, Promise<void>>();
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {
    super();
  }

  override async record(input: RecordAgentActorInput): Promise<void> {
    await this.ensureLoaded(input.agentId);
    this.recordForAgent(input.agentId, input);
    await this.persist(input.agentId);
  }

  override async setProviderMessageId(
    agentId: string,
    clientMessageId: string,
    providerMessageId: string,
  ): Promise<void> {
    await this.ensureLoaded(agentId);
    if (this.setProviderMessageIdForAgent(agentId, clientMessageId, providerMessageId)) {
      await this.persist(agentId);
    }
  }

  override async list(agentId: string): Promise<readonly AgentActorLedgerEntry[]> {
    await this.ensureLoaded(agentId);
    return super.list(agentId);
  }

  override async deleteAgent(agentId: string): Promise<void> {
    await this.ensureLoaded(agentId);
    await this.writes.get(agentId)?.catch(() => undefined);
    await super.deleteAgent(agentId);
    this.loaded.delete(agentId);
    await fs.unlink(this.filePath(agentId)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  override async flush(): Promise<void> {
    await Promise.allSettled([...this.loadTasks.values(), ...this.writes.values()]);
  }

  private async ensureLoaded(agentId: string): Promise<void> {
    if (this.loaded.has(agentId)) return;
    const pending = this.loadTasks.get(agentId);
    if (pending) return pending;
    const task = this.load(agentId).finally(() => {
      if (this.loadTasks.get(agentId) === task) this.loadTasks.delete(agentId);
    });
    this.loadTasks.set(agentId, task);
    return task;
  }

  private async load(agentId: string): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath(agentId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.loaded.add(agentId);
        return;
      }
      throw error;
    }
    const parsed = AgentActorLedgerFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`Invalid agent actor ledger for ${agentId}: ${parsed.error.message}`);
    }
    this.replaceEntries(agentId, parsed.data.entries);
    this.loaded.add(agentId);
  }

  private persist(agentId: string): Promise<void> {
    const previous = this.writes.get(agentId) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(() => this.writeEntries(agentId))
      .finally(() => {
        if (this.writes.get(agentId) === task) this.writes.delete(agentId);
      });
    this.writes.set(agentId, task);
    return task;
  }

  private async writeEntries(agentId: string): Promise<void> {
    const entries = await super.list(agentId);
    await fs.mkdir(this.directory, { recursive: true });
    await writeJsonFileAtomic(this.filePath(agentId), {
      version: AGENT_ACTOR_LEDGER_VERSION,
      entries,
    });
  }

  private filePath(agentId: string): string {
    return path.join(this.directory, `${agentId}.json`);
  }
}
