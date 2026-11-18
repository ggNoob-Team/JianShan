import { describe, expect, it } from "vitest";
import { resolveNewWorkspaceIsolation } from "./isolation";

describe("resolveNewWorkspaceIsolation", () => {
  it("defaults Git projects to worktree and keeps local selectable", () => {
    expect(
      resolveNewWorkspaceIsolation({
        supportsMultiplicity: true,
        worktreeSupport: "supported",
      }),
    ).toEqual({
      isolation: "worktree",
      availableIsolations: ["worktree", "local"],
      showIsolationField: true,
      showRefPicker: true,
    });
  });

  it("uses an explicitly selected local workspace for a Git project", () => {
    expect(
      resolveNewWorkspaceIsolation({
        supportsMultiplicity: true,
        worktreeSupport: "supported",
        selectedIsolation: "local",
      }),
    ).toEqual({
      isolation: "local",
      availableIsolations: ["worktree", "local"],
      showIsolationField: true,
      showRefPicker: false,
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
      availableIsolations: ["worktree", "local"],
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
