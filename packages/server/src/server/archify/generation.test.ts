import { describe, expect, test, vi } from "vitest";
import type { ArchifyArtifactSummary, ArchifyGenerationTask } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { notifyArchifyArtifactDelivered } from "./delivery-events.js";
import { ArchifyGenerationService } from "./generation.js";

function artifactFor(task: ArchifyGenerationTask, index: number): ArchifyArtifactSummary {
  const diagram = task.diagrams[index]!;
  return {
    id: diagram.artifactId,
    type: diagram.type,
    title: `${diagram.type} diagram`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specBytes: 10,
    artifactBytes: 20,
    generatorAgentId: diagram.generatorAgentId ?? task.agentId,
    request: null,
    scope: null,
  };
}

function workerAgentId(type: string): string {
  return `agent_${type}`;
}

function createService(options?: {
  runGenerator?: (agentId: string, prompt: string) => Promise<{ canceled: boolean }>;
  stopGenerator?: (agentId: string) => Promise<void>;
  scanEvidence?: () => Promise<{ revision: string; cached: boolean; digest: string }>;
}) {
  const updates: ArchifyGenerationTask[] = [];
  const stopGenerator = options?.stopGenerator ?? vi.fn(async () => undefined);
  const archiveAgent = vi.fn(async () => undefined);
  const createdAgentIds: string[] = [];
  const createdAgentInputs: Array<{ internal?: boolean }> = [];
  const service = new ArchifyGenerationService({
    paseoHome: "/tmp/paseo-archify-generation",
    workspaceRegistry: {
      get: async () => ({ workspaceId: "ws_1", cwd: "/repo" }) as never,
    },
    createAgent: (async (input: { labels?: Record<string, string> }) => {
      const agentId = workerAgentId(input.labels?.["paseo.archify-type"] ?? "unknown");
      createdAgentIds.push(agentId);
      createdAgentInputs.push(input);
      return { snapshot: { id: agentId } };
    }) as never,
    agentManager: {} as never,
    logger: createTestLogger(),
    onTaskUpdated: (task) => updates.push(task),
    deps: {
      scanEvidence: (options?.scanEvidence ??
        (async () => ({ revision: "git:abc", cached: false, digest: "# evidence" }))) as never,
      runGenerator: options?.runGenerator ?? (async () => ({ canceled: false })),
      stopGenerator,
      archiveAgent,
    },
  });
  return { service, updates, stopGenerator, archiveAgent, createdAgentIds, createdAgentInputs };
}

/** A generator whose workers only finish when the test releases them. */
function gatedGenerator() {
  const releases: Array<() => void> = [];
  return {
    releases,
    runGenerator: () =>
      new Promise<{ canceled: boolean }>((resolve) => {
        releases.push(() => resolve({ canceled: false }));
      }),
  };
}

async function startedTask(service: ArchifyGenerationService) {
  const task = await service.start({
    workspaceId: "ws_1",
    types: ["architecture", "sequence"],
    provider: "codex",
  });
  await vi.waitFor(() => {
    expect(service.get("ws_1")?.diagrams.every((diagram) => diagram.status === "drawing")).toBe(
      true,
    );
  });
  return task;
}

function deliver(workspaceId: string, task: ArchifyGenerationTask, index: number): void {
  const diagram = task.diagrams[index]!;
  notifyArchifyArtifactDelivered({
    workspaceId,
    generatorAgentId: workerAgentId(diagram.type),
    artifact: artifactFor(task, index),
  });
}

describe("ArchifyGenerationService", () => {
  test("runs one worker per diagram in parallel and reports each delivery", async () => {
    const { releases, runGenerator } = gatedGenerator();
    const { service, archiveAgent, createdAgentIds, createdAgentInputs } = createService({
      runGenerator,
    });

    const started = await startedTask(service);
    expect(started.diagrams.map((diagram) => diagram.generatorAgentId)).toEqual([
      "agent_architecture",
      "agent_sequence",
    ]);
    expect(createdAgentIds).toEqual(["agent_architecture", "agent_sequence"]);
    expect(createdAgentInputs.map((input) => input.internal)).toEqual([true, true]);
    expect(releases).toHaveLength(2);
    expect(service.get("ws_1")?.diagrams.map((diagram) => diagram.generatorAgentId)).toEqual([
      "agent_architecture",
      "agent_sequence",
    ]);

    const running = service.get("ws_1")!;
    deliver("ws_1", running, 0);
    // The architecture diagram lands while the other worker is still drawing.
    expect(service.get("ws_1")?.diagrams[0]?.status).toBe("delivered");
    expect(service.get("ws_1")?.diagrams[1]?.status).toBe("drawing");

    deliver("ws_1", running, 1);
    for (const release of releases) release();

    await vi.waitFor(() => {
      expect(service.get("ws_1")?.status).toBe("completed");
    });
    const task = service.get("ws_1")!;
    expect(task.stage).toBe("done");
    expect(task.diagrams.map((diagram) => diagram.status)).toEqual(["delivered", "delivered"]);
    expect(task.diagrams.map((diagram) => diagram.generatorAgentId)).toEqual([
      "agent_architecture",
      "agent_sequence",
    ]);
    expect(task.finishedAt).not.toBeNull();
    // Internal workers stay addressable so the completed trace can be opened later.
    expect(archiveAgent).not.toHaveBeenCalled();
  });

  test("a worker that delivers survives another worker failing", async () => {
    const { releases, runGenerator } = gatedGenerator();
    const { service } = createService({ runGenerator });

    await startedTask(service);
    const running = service.get("ws_1")!;
    deliver("ws_1", running, 0);
    for (const release of releases) release();

    await vi.waitFor(() => {
      expect(service.get("ws_1")?.status).toBe("failed");
    });
    const task = service.get("ws_1")!;
    expect(task.diagrams[0]?.status).toBe("delivered");
    expect(task.diagrams[1]?.status).toBe("failed");
    expect(task.error).toBeTruthy();
  });

  test("a delivery counts for the worker's own diagram even under another artifact id", async () => {
    const { releases, runGenerator } = gatedGenerator();
    const { service } = createService({ runGenerator });

    await startedTask(service);
    const running = service.get("ws_1")!;
    const diagram = running.diagrams[1]!;
    notifyArchifyArtifactDelivered({
      workspaceId: "ws_1",
      generatorAgentId: workerAgentId(diagram.type),
      artifact: { ...artifactFor(running, 1), id: "sequence-renamed-by-the-model" },
    });
    for (const release of releases) release();

    await vi.waitFor(() => {
      expect(service.get("ws_1")?.diagrams[1]?.status).toBe("delivered");
    });
    const delivered = service.get("ws_1")!.diagrams[1]!;
    expect(delivered.artifact?.id).toBe("sequence-renamed-by-the-model");
  });

  test("a worker whose run throws stays inspectable and only fails its own diagram", async () => {
    const { service, archiveAgent } = createService({
      runGenerator: async (agentId) => {
        if (agentId === workerAgentId("sequence")) throw new Error("provider exploded");
        return { canceled: false };
      },
    });

    await service.start({
      workspaceId: "ws_1",
      types: ["architecture", "sequence"],
      provider: "codex",
    });

    await vi.waitFor(() => {
      expect(service.get("ws_1")?.status).toBe("failed");
    });
    const task = service.get("ws_1")!;
    expect(task.diagrams[1]?.status).toBe("failed");
    expect(task.diagrams[1]?.error).toBe("provider exploded");
    expect(task.diagrams.map((diagram) => diagram.generatorAgentId)).toEqual([
      "agent_architecture",
      "agent_sequence",
    ]);
    expect(archiveAgent).not.toHaveBeenCalled();
  });

  test("cancel keeps delivered diagrams and stops every worker", async () => {
    const { runGenerator } = gatedGenerator();
    const { service, stopGenerator } = createService({ runGenerator });

    await startedTask(service);
    const running = service.get("ws_1")!;
    deliver("ws_1", running, 0);

    const canceled = await service.cancel(running.taskId);

    expect(canceled?.status).toBe("canceled");
    expect(canceled?.diagrams[0]?.status).toBe("delivered");
    expect(canceled?.diagrams[1]?.status).toBe("canceled");
    expect(stopGenerator.mock.calls.map(([agentId]) => agentId).sort()).toEqual([
      "agent_architecture",
      "agent_sequence",
    ]);
  });

  test("rerun starts a fresh task for the diagrams that did not arrive", async () => {
    const { releases, runGenerator } = gatedGenerator();
    const { service } = createService({ runGenerator });

    await startedTask(service);
    const running = service.get("ws_1")!;
    deliver("ws_1", running, 0);
    for (const release of releases) release();
    await vi.waitFor(() => {
      expect(service.get("ws_1")?.status).toBe("failed");
    });
    const failed = service.get("ws_1")!;

    const rerun = await service.rerun(failed.taskId);

    expect(rerun?.taskId).not.toBe(failed.taskId);
    expect(rerun?.diagrams.map((diagram) => diagram.type)).toEqual(["sequence"]);
    expect(rerun?.status).toBe("running");
    expect(service.get("ws_1")?.taskId).toBe(rerun?.taskId);
  });

  test("a failed scan fails the task without creating workers", async () => {
    const { service, createdAgentIds } = createService({
      scanEvidence: async () => {
        throw new Error("scan exploded");
      },
    });

    await service.start({ workspaceId: "ws_1", types: ["architecture"], provider: "codex" });

    await vi.waitFor(() => {
      expect(service.get("ws_1")?.status).toBe("failed");
    });
    const task = service.get("ws_1")!;
    expect(task.error).toBe("scan exploded");
    expect(task.agentId).toBeNull();
    expect(task.diagrams[0]?.generatorAgentId).toBeNull();
    expect(task.diagrams[0]?.status).toBe("failed");
    expect(createdAgentIds).toEqual([]);
  });

  test("archives workers from the previous run only after the next run starts", async () => {
    const { service, archiveAgent } = createService({
      runGenerator: async () => ({ canceled: false }),
    });

    await service.start({ workspaceId: "ws_1", types: ["architecture"], provider: "codex" });
    await vi.waitFor(() => {
      expect(service.get("ws_1")?.status).toBe("failed");
    });
    expect(archiveAgent).not.toHaveBeenCalled();

    await service.start({ workspaceId: "ws_1", types: ["sequence"], provider: "codex" });

    expect(archiveAgent.mock.calls.map(([agentId]) => agentId)).toEqual(["agent_architecture"]);
  });
});
