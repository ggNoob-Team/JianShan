export type WorkspaceIsolation = "local" | "worktree";

const WORKTREE_ONLY: readonly WorkspaceIsolation[] = ["worktree"];
const WORKTREE_AND_LOCAL: readonly WorkspaceIsolation[] = ["worktree", "local"];
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
  selectedIsolation?: WorkspaceIsolation | null;
}): NewWorkspaceIsolationState {
  let availableIsolations = WORKTREE_ONLY;
  if (input.supportsMultiplicity) {
    availableIsolations = input.worktreeSupport === "unsupported" ? LOCAL_ONLY : WORKTREE_AND_LOCAL;
  }
  const defaultIsolation: WorkspaceIsolation = availableIsolations.includes("worktree")
    ? "worktree"
    : "local";
  const isolation =
    input.selectedIsolation && availableIsolations.includes(input.selectedIsolation)
      ? input.selectedIsolation
      : defaultIsolation;

  return {
    isolation,
    availableIsolations,
    showIsolationField: true,
    showRefPicker: !input.supportsMultiplicity || isolation === "worktree",
  };
}
