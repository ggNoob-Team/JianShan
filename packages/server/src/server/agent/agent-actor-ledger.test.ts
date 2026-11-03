import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { AgentTimelineItem } from "./agent-sdk-types.js";
import {
  AgentActorHistoryMatcher,
  FileAgentActorLedger,
  type AgentActorLedgerEntry,
} from "./agent-actor-ledger.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<{ directory: string; agentId: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-agent-actor-ledger-"));
  directories.push(directory);
  return { directory, agentId: "00000000-0000-4000-8000-000000000401" };
}

describe("FileAgentActorLedger", () => {
  test("survives reconstruction and restores actors in provider history order", async () => {
    const { directory, agentId } = await fixture();
    const ledger = new FileAgentActorLedger(directory);
    const first = { clientId: "client-a", clientName: "Harmony Emulator" };
    const second = { clientId: "client-b", clientName: "Living Room Tablet" };
    const third = { clientId: "client-c", clientName: "CLI" };

    await ledger.record({
      agentId,
      clientMessageId: "message-1",
      text: "same prompt",
      actor: first,
      recordedAt: "2026-11-02T00:00:01.000Z",
    });
    await ledger.record({
      agentId,
      clientMessageId: "message-2",
      text: "same prompt",
      actor: second,
      recordedAt: "2026-11-02T00:00:02.000Z",
    });
    await ledger.record({
      agentId,
      clientMessageId: "message-3",
      text: "different prompt",
      actor: third,
      recordedAt: "2026-11-02T00:00:03.000Z",
    });
    await ledger.setProviderMessageId(agentId, "message-3", "provider-3");
    await ledger.flush();

    const reconstructed = new FileAgentActorLedger(directory);
    const entries = await reconstructed.list(agentId);
    expect(entries).toEqual<AgentActorLedgerEntry[]>([
      expect.objectContaining({
        clientMessageId: "message-1",
        actor: first,
      }),
      expect.objectContaining({
        clientMessageId: "message-2",
        actor: second,
      }),
      expect.objectContaining({
        clientMessageId: "message-3",
        actor: third,
        providerMessageId: "provider-3",
      }),
    ]);

    const matcher = new AgentActorHistoryMatcher(entries);
    expect(
      matcher.match({
        type: "user_message",
        text: "provider formatted prompt",
        messageId: "provider-3",
      }),
    ).toEqual({
      type: "user_message",
      text: "provider formatted prompt",
      messageId: "provider-3",
      actor: third,
    });
    expect(matcher.match({ type: "user_message", text: "same prompt" })).toMatchObject({
      actor: first,
    });
    expect(matcher.match({ type: "user_message", text: "same prompt" })).toMatchObject({
      actor: second,
    });
    expect(matcher.match({ type: "user_message", text: "same prompt" })).toEqual({
      type: "user_message",
      text: "same prompt",
    } satisfies AgentTimelineItem);
  });

  test("deletes only the requested agent ledger", async () => {
    const { directory, agentId } = await fixture();
    const ledger = new FileAgentActorLedger(directory);
    await ledger.record({
      agentId,
      clientMessageId: "message",
      text: "hello",
      actor: { clientId: "client" },
      recordedAt: "2026-11-02T00:00:00.000Z",
    });

    await ledger.deleteAgent(agentId);

    await expect(ledger.list(agentId)).resolves.toEqual([]);
    await expect(new FileAgentActorLedger(directory).list(agentId)).resolves.toEqual([]);
  });
});
