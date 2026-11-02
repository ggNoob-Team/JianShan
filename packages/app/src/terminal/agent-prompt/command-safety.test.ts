import { describe, expect, it } from "vitest";
import { assessTerminalCommand } from "./command-safety";

describe("assessTerminalCommand", () => {
  it.each(["ls -la", "git status", "df -h", "grep -n error app.log", "cat README.md"])(
    "auto-runs read-only command %s",
    (command) => {
      expect(assessTerminalCommand(command).risk).toBe("safe");
    },
  );

  it.each([
    "rm notes.txt",
    "chmod 600 secret.txt",
    "curl https://example.com",
    "unknown-command --flag",
    "npm run build",
  ])("asks for approval before running %s", (command) => {
    expect(assessTerminalCommand(command).risk).toBe("confirm");
  });

  it.each([
    "rm -rf /",
    "rm -r ~",
    "mkfs.ext4 /dev/sda1",
    "shutdown -h now",
    String.raw`dd of=\\.\PhysicalDrive0 if=image.iso`,
    "ls\nrm -rf /",
  ])("refuses destructive command %s", (command) => {
    expect(assessTerminalCommand(command).risk).toBe("blocked");
  });

  it("does not mistake quoted operators for shell syntax", () => {
    expect(assessTerminalCommand("echo 'value > 1'").risk).toBe("safe");
    expect(assessTerminalCommand('grep "a|b" file.txt').risk).toBe("safe");
  });

  it("requires approval for shell expansion and redirection", () => {
    expect(assessTerminalCommand("echo $(whoami)").risk).toBe("confirm");
    expect(assessTerminalCommand('echo "$(whoami)"').risk).toBe("confirm");
    expect(assessTerminalCommand("ls > files.txt").risk).toBe("confirm");
  });
});
