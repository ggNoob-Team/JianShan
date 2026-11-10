import { describe, expect, test } from "vitest";
import { SessionInboundMessageSchema, SessionOutboundMessageSchema } from "./messages.js";

const job = {
  jobId: "local-job-1",
  workspaceId: "workspace-1",
  command: "npm",
  args: ["run", "test"],
  status: "running" as const,
  startedAt: "2026-11-09T10:00:00.000Z",
  finishedAt: null,
  exitCode: null,
  signal: null,
  outputTail: ["Starting tests"],
  error: null,
};

describe("local job protocol", () => {
  test("parses a command job request and snapshot response", () => {
    const request = {
      type: "local.job.start.request" as const,
      requestId: "request-1",
      workspaceId: "workspace-1",
      command: "npm",
      args: ["run", "test"],
      timeoutMs: 60_000,
    };
    const response = {
      type: "local.job.start.response" as const,
      payload: { requestId: "request-1", job },
    };

    expect(SessionInboundMessageSchema.parse(request)).toEqual(request);
    expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
  });

  test("parses runtime capabilities and workspace mappings", () => {
    const response = {
      type: "local.runtime.inspect.response" as const,
      payload: {
        requestId: "request-2",
        runtime: {
          platform: "win32",
          arch: "x64",
          capabilities: ["local.jobs" as const],
          workspaces: [
            {
              workspaceId: "workspace-1",
              cwd: "C:\\Users\\fujie\\projects\\tool\\paseo",
              title: "Paseo",
            },
          ],
        },
      },
    };

    expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
  });
});
