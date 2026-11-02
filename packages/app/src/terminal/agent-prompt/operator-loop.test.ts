import { describe, expect, it, vi } from "vitest";
import {
  runTerminalOperatorLoop,
  type TerminalOperatorLoopEvent,
  type TerminalOperatorLoopInput,
} from "./operator-loop";

function createHarness(replies: string[], overrides: Partial<TerminalOperatorLoopInput> = {}) {
  const events: TerminalOperatorLoopEvent[] = [];
  const prompts: string[] = [];
  const executeCommands = vi.fn(async (commands: string[]) => ({
    output: `output for ${commands.join(" && ")}`,
    canceled: false,
  }));
  const requestApproval = vi.fn(async () => "run" as const);
  const input: TerminalOperatorLoopInput = {
    request: "check the server",
    cwd: "/repo",
    signal: new AbortController().signal,
    sendPrompt: async (prompt) => {
      prompts.push(prompt);
    },
    waitForReply: async () => {
      const reply = replies.shift();
      if (!reply) throw new Error("missing reply");
      return reply;
    },
    requestApproval,
    executeCommands,
    onEvent: (event) => events.push(event),
    ...overrides,
  };
  return { input, events, prompts, executeCommands, requestApproval };
}

describe("runTerminalOperatorLoop", () => {
  it("feeds safe command output into the next agent turn and finishes", async () => {
    const harness = createHarness([
      '{"action":"run","commands":["uptime"]}',
      '{"action":"run","commands":["df -h"]}',
      '{"action":"finish","conclusion":"Load is normal."}',
    ]);

    const result = await runTerminalOperatorLoop(harness.input);

    expect(result).toEqual({ status: "done", conclusion: "Load is normal." });
    expect(harness.requestApproval).not.toHaveBeenCalled();
    expect(harness.executeCommands).toHaveBeenNthCalledWith(
      1,
      ["uptime"],
      expect.objectContaining({ signal: harness.input.signal }),
    );
    expect(harness.executeCommands).toHaveBeenNthCalledWith(
      2,
      ["df -h"],
      expect.objectContaining({ signal: harness.input.signal }),
    );
    expect(harness.prompts[1]).toContain("output for uptime");
    expect(harness.events.map((event) => event.type)).toEqual([
      "planning",
      "executing",
      "executed",
      "planning",
      "executing",
      "executed",
      "planning",
      "finished",
    ]);
  });

  it("waits for approval before running a mutating command", async () => {
    const harness = createHarness([
      '{"action":"run","commands":["rm temp.txt"]}',
      '{"action":"finish","conclusion":"Removed it."}',
    ]);

    const result = await runTerminalOperatorLoop(harness.input);

    expect(result.status).toBe("done");
    expect(harness.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        round: 1,
        commands: [expect.objectContaining({ command: "rm temp.txt", risk: "confirm" })],
      }),
    );
    expect(harness.executeCommands).toHaveBeenCalledWith(["rm temp.txt"], expect.anything());
  });

  it("never executes a blocked command and reports the refusal to the agent", async () => {
    const harness = createHarness([
      '{"action":"run","commands":["rm -rf /"]}',
      '{"action":"finish","conclusion":"Refused safely."}',
    ]);

    const result = await runTerminalOperatorLoop(harness.input);

    expect(result).toEqual({ status: "done", conclusion: "Refused safely." });
    expect(harness.requestApproval).not.toHaveBeenCalled();
    expect(harness.executeCommands).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: "blocked",
        commands: [expect.objectContaining({ command: "rm -rf /", risk: "blocked" })],
      }),
    );
    expect(harness.prompts[1]).toContain("safety gate refused");
  });

  it("does not execute commands the user rejects", async () => {
    const requestApproval = vi.fn(async () => "reject" as const);
    const harness = createHarness(
      [
        '{"action":"run","commands":["chmod 777 file"]}',
        '{"action":"finish","conclusion":"Canceled the change."}',
      ],
      { requestApproval },
    );

    const result = await runTerminalOperatorLoop(harness.input);

    expect(result.status).toBe("done");
    expect(harness.executeCommands).not.toHaveBeenCalled();
    expect(harness.prompts[1]).toContain("user rejected");
  });

  it("returns canceled when the user cancels approval", async () => {
    const requestApproval = vi.fn(async () => "cancel" as const);
    const harness = createHarness(['{"action":"run","commands":["chmod 777 file"]}'], {
      requestApproval,
    });

    await expect(runTerminalOperatorLoop(harness.input)).resolves.toEqual({
      status: "canceled",
    });
    expect(harness.executeCommands).not.toHaveBeenCalled();
  });

  it("returns canceled when PTY execution is interrupted", async () => {
    const executeCommands = vi.fn(async () => ({ output: "", canceled: true }));
    const harness = createHarness(['{"action":"run","commands":["sleep 30"]}'], {
      executeCommands,
    });

    await expect(runTerminalOperatorLoop(harness.input)).resolves.toEqual({
      status: "canceled",
    });
    expect(harness.events.at(-1)?.type).toBe("canceled");
  });
});
