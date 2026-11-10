import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTerminalManager, type TerminalManager } from "../../terminal/terminal-manager.js";
import { createLocalJobService } from "./local-job-service.js";

const temporaryDirectories: string[] = [];
const terminalManagers: TerminalManager[] = [];

async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "paseo-local-job-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createService() {
  const terminalManager = createTerminalManager();
  terminalManagers.push(terminalManager);
  return createLocalJobService({
    terminalManager,
    createJobId: () => "local-job-test",
  });
}

afterEach(async () => {
  for (const manager of terminalManagers.splice(0)) {
    manager.killAll();
  }
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("local job service", () => {
  test("runs a command and retains its successful output", async () => {
    const cwd = await createWorkspace();
    const service = createService();

    const started = await service.start({
      workspaceId: "workspace-1",
      cwd,
      command: process.execPath,
      args: ["-e", "process.stdout.write('local job output')"],
    });
    const finished = await service.wait(started.jobId, 5_000);

    expect(finished).toMatchObject({
      jobId: "local-job-test",
      workspaceId: "workspace-1",
      status: "succeeded",
      exitCode: 0,
      error: null,
    });
    expect(finished?.outputTail.join("\n")).toContain("local job output");
  });

  test("records a failing exit code", async () => {
    const cwd = await createWorkspace();
    const service = createService();

    const started = await service.start({
      workspaceId: "workspace-1",
      cwd,
      command: process.execPath,
      args: ["-e", "process.stderr.write('test failure'); process.exit(2)"],
    });
    const finished = await service.wait(started.jobId, 5_000);

    expect(finished).toMatchObject({
      status: "failed",
      exitCode: 2,
      error: "Local job exited with code 2",
    });
    expect(finished?.outputTail.join("\n")).toContain("test failure");
  });

  test("cancels a running command", async () => {
    const cwd = await createWorkspace();
    const service = createService();
    const started = await service.start({
      workspaceId: "workspace-1",
      cwd,
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
    });

    const canceled = await service.cancel(started.jobId);

    expect(canceled).toMatchObject({
      status: "canceled",
      error: "Canceled by remote requester",
    });
  });

  test("fails a command that exceeds its timeout", async () => {
    const cwd = await createWorkspace();
    const service = createService();
    const started = await service.start({
      workspaceId: "workspace-1",
      cwd,
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 50,
    });

    const finished = await service.wait(started.jobId, 5_000);

    expect(finished).toMatchObject({
      status: "failed",
      error: "Local job timed out",
    });
  });
});
