import { describe, expect, it } from "vitest";
import { appendWindowsPathEntry, windowsPathContainsEntry } from "./windows-path";

const ENV: NodeJS.ProcessEnv = { USERPROFILE: "C:\\Users\\Mo" };
const BIN_DIR = "C:\\Users\\Mo\\.local\\bin";

describe("appendWindowsPathEntry", () => {
  it("appends the CLI bin directory when it is missing", () => {
    expect(appendWindowsPathEntry("C:\\Windows;C:\\Tools", BIN_DIR, ENV)).toEqual({
      path: "C:\\Windows;C:\\Tools;C:\\Users\\Mo\\.local\\bin",
      changed: true,
    });
  });

  it.each([
    "%USERPROFILE%\\.local\\bin\\",
    '"C:\\Users\\Mo\\.local\\bin"',
    "c:/users/mo/.local/bin",
    "C:\\Users\\Mo\\.local\\bin\\",
  ])("recognizes an existing equivalent entry: %s", (existingEntry) => {
    const currentPath = `C:\\Windows;${existingEntry};C:\\Tools`;

    expect(appendWindowsPathEntry(currentPath, BIN_DIR, ENV)).toEqual({
      path: currentPath,
      changed: false,
    });
    expect(windowsPathContainsEntry(currentPath, BIN_DIR, ENV)).toBe(true);
  });

  it("handles an empty user PATH", () => {
    expect(appendWindowsPathEntry("", BIN_DIR, ENV)).toEqual({
      path: BIN_DIR,
      changed: true,
    });
  });

  it("does not treat a different local bin directory as present", () => {
    expect(
      windowsPathContainsEntry("C:\\Windows;C:\\Users\\Other\\.local\\bin", BIN_DIR, ENV),
    ).toBe(false);
  });
});
