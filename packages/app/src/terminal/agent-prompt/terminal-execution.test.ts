import { describe, expect, it } from "vitest";
import {
  detectShellPromptAtEnd,
  detectTerminalInputRequest,
  hasTerminalCommandFinishedMarker,
  readTerminalOutputTail,
} from "./terminal-execution";

describe("detectTerminalInputRequest", () => {
  it("detects sudo password prompts", () => {
    expect(detectTerminalInputRequest("[sudo] password for fujie: ")).toBe("password");
    expect(detectTerminalInputRequest("Password:")).toBe("password");
    expect(detectTerminalInputRequest("请输入密码：")).toBe("password");
  });

  it("detects explicit confirmation prompts", () => {
    expect(detectTerminalInputRequest("Overwrite file? [y/N]")).toBe("confirmation");
    expect(detectTerminalInputRequest("Continue? (yes/no)")).toBe("confirmation");
  });

  it("ignores normal command output", () => {
    expect(detectTerminalInputRequest("load average: 0.97, 1.04")).toBeNull();
    expect(detectTerminalInputRequest("password: example in documentation")).toBeNull();
  });
});

describe("readTerminalOutputTail", () => {
  it("only decodes the trailing bytes", () => {
    const decode = (chunks: Uint8Array[]) => Buffer.concat(chunks).toString("utf8");
    const sanitize = (text: string) => text.trim();
    expect(
      readTerminalOutputTail([Buffer.from("old-"), Buffer.from("new")], 3, decode, sanitize),
    ).toBe("new");
  });
});

describe("detectShellPromptAtEnd", () => {
  it.each([
    "ubuntu@ubuntu:/data/project/tool/warp$",
    "root@server:/srv/app#",
    "dev@host:~%",
    "PS C:/Users/dev/repo>",
    "C:/Users/dev/repo>",
    "/srv/app$",
  ])("recognizes a returned shell prompt %s", (prompt) => {
    expect(detectShellPromptAtEnd(["command output", "", prompt, ""].join("\n"))).toBe(true);
  });

  it("does not treat ordinary output as completion", () => {
    expect(detectShellPromptAtEnd("waiting for the service to start...")).toBe(false);
    expect(detectShellPromptAtEnd("the total cost is 12 dollars")).toBe(false);
    expect(detectShellPromptAtEnd("")).toBe(false);
  });
});

describe("hasTerminalCommandFinishedMarker", () => {
  it("detects OSC 633 command completion", () => {
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    expect(hasTerminalCommandFinishedMarker("output" + esc + "]633;D;0" + bel)).toBe(true);
    expect(hasTerminalCommandFinishedMarker("output" + esc + "]633;D" + bel)).toBe(true);
  });

  it("ignores ordinary output and unrelated OSC sequences", () => {
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    expect(hasTerminalCommandFinishedMarker("output")).toBe(false);
    expect(hasTerminalCommandFinishedMarker(esc + "]633;A" + bel)).toBe(false);
  });
});
