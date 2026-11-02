import { describe, expect, it } from "vitest";
import {
  buildOperatorLimitPrompt,
  buildOperatorObservationPrompt,
  buildOperatorStartPrompt,
  parseCommandPlan,
  parseOperatorDecision,
} from "./command-plan";

describe("buildOperatorStartPrompt", () => {
  it("includes the request, cwd, and strict JSON contract", () => {
    const prompt = buildOperatorStartPrompt({
      request: "当前服务器负载",
      cwd: "/srv/app",
    });
    expect(prompt).toContain("当前服务器负载");
    expect(prompt).toContain("/srv/app");
    expect(prompt).toContain('"action":"run"');
    expect(prompt).toContain('"action":"finish"');
    expect(prompt).toContain("visible PTY");
  });
});

describe("buildOperatorObservationPrompt", () => {
  it("feeds real command output into the next round", () => {
    const prompt = buildOperatorObservationPrompt({
      cwd: "/srv/app",
      observation: {
        type: "executed",
        round: 1,
        commands: ["uptime", "nproc"],
        output: "load average: 0.97, 1.04, 1.13\n32",
      },
    });
    expect(prompt).toContain("$ uptime");
    expect(prompt).toContain("$ nproc");
    expect(prompt).toContain("load average: 0.97, 1.04, 1.13");
    expect(prompt).toContain("exactly one JSON object");
  });

  it("explains blocked commands and forbids retrying them", () => {
    const prompt = buildOperatorObservationPrompt({
      cwd: "/srv/app",
      observation: {
        type: "blocked",
        round: 2,
        commands: ["rm -rf /"],
        reasons: ["recursive delete of a root or home target"],
      },
    });
    expect(prompt).toContain("safety gate refused");
    expect(prompt).toContain("recursive delete");
    expect(prompt).toContain("Never retry");
  });

  it("explains rejected commands and asks for another approach", () => {
    const prompt = buildOperatorObservationPrompt({
      cwd: "/srv/app",
      observation: {
        type: "rejected",
        round: 3,
        commands: ["chmod 777 file"],
        reason: null,
      },
    });
    expect(prompt).toContain("user rejected");
    expect(prompt).toContain("Do not run those commands again");
  });

  it("truncates very large output", () => {
    const prompt = buildOperatorObservationPrompt({
      cwd: "/srv/app",
      observation: {
        type: "executed",
        round: 1,
        commands: ["cat big.log"],
        output: "x".repeat(30_000),
      },
    });
    expect(prompt).toContain("...[truncated]");
    expect(prompt.length).toBeLessThan(14_000);
  });
});

describe("buildOperatorLimitPrompt", () => {
  it("requires a final conclusion without more commands", () => {
    const prompt = buildOperatorLimitPrompt({ cwd: "/srv/app" });
    expect(prompt).toContain("maximum number of command rounds");
    expect(prompt).toContain('"action":"finish"');
  });
});

describe("parseOperatorDecision", () => {
  it("parses a run decision", () => {
    expect(
      parseOperatorDecision('{"action":"run","commands":["uptime","df -h"],"note":"inspect"}'),
    ).toEqual({ type: "commands", commands: ["uptime", "df -h"], note: "inspect" });
  });

  it("parses a fenced JSON decision surrounded by prose", () => {
    const reply = 'Here is the next step:\n```json\n{"action":"run","commands":["free -m"]}\n```';
    expect(parseOperatorDecision(reply)).toEqual({
      type: "commands",
      commands: ["free -m"],
      note: null,
    });
  });

  it("parses a finish decision", () => {
    expect(parseOperatorDecision('{"action":"finish","conclusion":"All good."}')).toEqual({
      type: "finish",
      conclusion: "All good.",
    });
  });

  it("accepts NO_COMMAND and fenced command fallback", () => {
    expect(parseOperatorDecision("NO_COMMAND")).toEqual({ type: "finish", conclusion: "" });
    expect(parseOperatorDecision("```bash\n$ uptime\n> free -m\n```")).toEqual({
      type: "commands",
      commands: ["uptime", "free -m"],
      note: null,
    });
  });

  it("rejects malformed replies instead of guessing", () => {
    expect(() => parseOperatorDecision("I will run something later.")).toThrow(
      "invalid terminal decision",
    );
  });
});

describe("parseCommandPlan", () => {
  it("returns commands from a structured decision", () => {
    expect(parseCommandPlan('{"action":"run","commands":["uptime"]}')).toEqual(["uptime"]);
  });

  it("returns no commands for a finish decision", () => {
    expect(parseCommandPlan('{"action":"finish","conclusion":"Done"}')).toEqual([]);
  });
});
