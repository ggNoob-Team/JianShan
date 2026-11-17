import { describe, expect, it } from "vitest";
import { resolveNewWorkspaceIsolation } from "./isolation";

describe("resolveNewWorkspaceIsolation", () => {
  it("defaults Git projects to worktree and omits local", () => {
    expect(
      resolveNewWorkspaceIsolation({
        supportsMultiplicity: true,
        worktreeSupport: "supported",
      }),
    ).toEqual({
      isolation: "worktree",
      availableIsolations: ["worktree"],
      showIsolationField: true,
      showRefPicker: true,
    });
  });

  it("uses only local when the project is not a Git checkout", () => {
    expect(
      resolveNewWorkspaceIsolation({
        supportsMultiplicity: true,
        worktreeSupport: "unsupported",
      }),
    ).toEqual({
      isolation: "local",
      availableIsolations: ["local"],
      showIsolationField: true,
      showRefPicker: false,
    });
  });

  it("keeps worktree selected while project Git support is still unknown", () => {
    expect(
      resolveNewWorkspaceIsolation({
        supportsMultiplicity: true,
        worktreeSupport: "unknown",
      }),
    ).toMatchObject({
      isolation: "worktree",
      availableIsolations: ["worktree"],
    });
  });

  it("keeps the legacy worktree path when the host cannot choose isolation", () => {
    expect(
      resolveNewWorkspaceIsolation({
        supportsMultiplicity: false,
        worktreeSupport: "supported",
      }),
    ).toMatchObject({
      isolation: "worktree",
      availableIsolations: ["worktree"],
      showRefPicker: true,
    });
  });
});
