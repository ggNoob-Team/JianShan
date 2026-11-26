import { beforeEach, describe, expect, it } from "vitest";
import {
  computeSidebarOrderUpdates,
  type SidebarProjectEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import { migrateSidebarOrderState, useSidebarOrderStore } from "./sidebar-order-store";

describe("migrateSidebarOrderState", () => {
  it("preserves legacy workspace ordering across hosts", () => {
    const migrated = migrateSidebarOrderState({
      projectOrderByServerId: {
        "host-a": ["project-a"],
        "host-b": ["project-a"],
      },
      workspaceOrderByServerAndProject: {
        "host-a::project-a": ["main", "feature"],
        "host-b::project-a": ["main"],
      },
    });

    expect(migrated).toEqual({
      projectOrder: ["project-a"],
      pinnedWorkspaceOrder: [],
      hostOrder: [],
      workspaceOrderByProject: {
        "project-a": ["host-a:main", "host-a:feature", "host-b:main"],
      },
    });
  });

  it("deduplicates pinned workspace order without rewriting identities", () => {
    const migrated = migrateSidebarOrderState({
      pinnedWorkspaceOrder: ["host-a:one", "host-a:one", "", "host-b:two"],
    });

    expect(migrated.pinnedWorkspaceOrder).toEqual(["host-a:one", "host-b:two"]);
  });

  it("normalizes saved host order", () => {
    const migrated = migrateSidebarOrderState({
      hostOrder: [" srv-b ", "srv-a", "srv-b", ""],
    });

    expect(migrated.hostOrder).toEqual(["srv-b", "srv-a"]);
  });
});

// A directory whose name ends in a space produces a view key that ends in a
// space. Trimming it on write used to make the sidebar's reconcile effect loop
// forever, crashing the app with React error #185 (see #4880).
describe("sidebar order keys that end in whitespace", () => {
  const PROJECT_KEY = "host:srv-1:/home/u/Reklamation ";

  beforeEach(() => {
    useSidebarOrderStore.setState({
      projectOrder: [],
      pinnedWorkspaceOrder: [],
    });
  });

  it("stores a project key exactly as given", () => {
    useSidebarOrderStore.getState().setProjectOrder([PROJECT_KEY]);

    expect(useSidebarOrderStore.getState().projectOrder).toEqual([PROJECT_KEY]);
  });

  it("stores each host once in the order the reader dropped it", () => {
    useSidebarOrderStore.getState().setHostOrder(["srv-b", "srv-a", "srv-b"]);

    expect(useSidebarOrderStore.getState().getHostOrder()).toEqual(["srv-b", "srv-a"]);
  });

  it("scopes a workspace order under the project key the sidebar indexes by", () => {
    useSidebarOrderStore.getState().setWorkspaceOrder(PROJECT_KEY, ["srv-1:main"]);

    // use-sidebar-workspaces-list reads workspaceOrderByProject by view key
    // directly, so the scope has to be stored under that same key.
    expect(useSidebarOrderStore.getState().workspaceOrderByProject[PROJECT_KEY]).toEqual([
      "srv-1:main",
    ]);
    expect(useSidebarOrderStore.getState().getWorkspaceOrder(PROJECT_KEY)).toEqual(["srv-1:main"]);
  });

  it("settles the sidebar order reconcile instead of rewriting it forever", () => {
    const projects: SidebarProjectEntry[] = [
      {
        viewKey: PROJECT_KEY,
        projectName: "Reklamation ",
        projectKind: "non_git",
        iconWorkingDir: "/home/u/Reklamation ",
        hosts: [],
        workspaces: [],
      },
    ];
    const runPass = () =>
      computeSidebarOrderUpdates({
        projects,
        persistedProjectOrder: useSidebarOrderStore.getState().projectOrder,
      });

    // First pass adds the newly visible project.
    const first = runPass();
    expect(first.projectOrder).toEqual([PROJECT_KEY]);
    useSidebarOrderStore.getState().setProjectOrder(first.projectOrder ?? []);

    // Second pass must find nothing left to do; otherwise the effect that
    // applies these updates re-runs on every render.
    expect(runPass().projectOrder).toBeNull();
  });

  it("still trims legacy keys when migrating per-host persisted state", () => {
    const migrated = migrateSidebarOrderState({
      projectOrderByServerId: { host: [" host-a:one ", "host-a:one"] },
    });

    expect(migrated.projectOrder).toEqual(["host-a:one"]);
  });
});

it("preserves project, pinned and ordinary workspace order", () => {
  expect(
    migrateSidebarOrderState({
      projectOrder: ["b", "a"],
      pinnedWorkspaceOrder: ["h:y", "h:x"],
      workspaceOrderByProject: { a: ["h:old", "h:new"] },
    }),
  ).toEqual({
    projectOrder: ["b", "a"],
    pinnedWorkspaceOrder: ["h:y", "h:x"],
    workspaceOrderByProject: { a: ["h:old", "h:new"] },
  });
});

it("preserves whitespace in current project and pin identities during upgrade", () => {
  expect(
    migrateSidebarOrderState({
      projectOrder: ["project "],
      pinnedWorkspaceOrder: ["host:workspace "],
      workspaceOrderByProject: {},
    }),
  ).toEqual({
    projectOrder: ["project "],
    pinnedWorkspaceOrder: ["host:workspace "],
    workspaceOrderByProject: {},
  });
});

it("retains a pre-beta manual order when upgrading", () => {
  expect(
    migrateSidebarOrderState({
      projectOrder: ["project"],
      pinnedWorkspaceOrder: [],
      workspaceOrderByProject: { project: ["host:b", "host:a"] },
    }),
  ).toEqual({
    projectOrder: ["project"],
    pinnedWorkspaceOrder: [],
    workspaceOrderByProject: { project: ["host:b", "host:a"] },
  });
});

it("starts with an empty manual order for beta users whose order was discarded", () => {
  expect(migrateSidebarOrderState({ projectOrder: ["p"], pinnedWorkspaceOrder: ["h:a"] })).toEqual({
    projectOrder: ["p"],
    pinnedWorkspaceOrder: ["h:a"],
    workspaceOrderByProject: {},
  });
});
it("preserves spaces in saved workspace scopes and identities", () => {
  expect(
    migrateSidebarOrderState({ workspaceOrderByProject: { "project ": ["host:b ", "host:a "] } })
      .workspaceOrderByProject,
  ).toEqual({ "project ": ["host:b ", "host:a "] });
});
