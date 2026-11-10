import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { FileAgentUsageLedger } from "./agent-usage-ledger.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-agent-usage-ledger-"));
  directories.push(directory);
  return directory;
}

describe("FileAgentUsageLedger", () => {
  test("persists and deduplicates usage by turn", async () => {
    const directory = await fixture();
    const ledger = new FileAgentUsageLedger(directory);
    const entry = {
      agentId: "agent-1",
      turnId: "turn-1",
      clientMessageId: "message-1",
      actor: { clientId: "client-1", clientName: "少爷" },
      provider: "codex",
      model: "deepseek-flash",
      startedAt: "2026-11-02T00:00:00.000Z",
      completedAt: "2026-11-02T00:00:10.000Z",
      usage: { inputTokens: 100, outputTokens: 20 },
    };
    await ledger.record(entry);
    await ledger.record({
      ...entry,
      completedAt: "2026-11-02T00:00:12.000Z",
      usage: { inputTokens: 120, outputTokens: 25, totalCostUsd: 0.01 },
    });
    await ledger.flush();

    const reconstructed = new FileAgentUsageLedger(directory);
    await expect(reconstructed.list("agent-1")).resolves.toEqual([
      expect.objectContaining({
        turnId: "turn-1",
        completedAt: "2026-11-02T00:00:12.000Z",
        usage: { inputTokens: 120, outputTokens: 25, totalCostUsd: 0.01 },
      }),
    ]);
    await expect(reconstructed.listAll()).resolves.toEqual([
      expect.objectContaining({ agentId: "agent-1", turnId: "turn-1" }),
    ]);
  });
});
