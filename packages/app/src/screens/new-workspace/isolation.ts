export type WorkspaceIsolation = "local" | "worktree";

const WORKTREE_ONLY: readonly WorkspaceIsolation[] = ["worktree"];
const LOCAL_ONLY: readonly WorkspaceIsolation[] = ["local"];

interface NewWorkspaceIsolationState {
  isolation: WorkspaceIsolation;
  availableIsolations: readonly WorkspaceIsolation[];
  showIsolationField: boolean;
  showRefPicker: boolean;
}

export function resolveNewWorkspaceIsolation(input: {
  supportsMultiplicity: boolean;
  worktreeSupport: "supported" | "unsupported" | "unknown";
}): NewWorkspaceIsolationState {
  const isolation: WorkspaceIsolation =
    !input.supportsMultiplicity || input.worktreeSupport !== "unsupported" ? "worktree" : "local";

  return {
    isolation,
    availableIsolations: isolation === "worktree" ? WORKTREE_ONLY : LOCAL_ONLY,
    showIsolationField: true,
    showRefPicker: !input.supportsMultiplicity || isolation === "worktree",
  };
}
