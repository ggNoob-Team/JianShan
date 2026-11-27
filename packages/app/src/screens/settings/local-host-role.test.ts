import { describe, expect, it } from "vitest";
import { needsLocalHostRoleSetup, resolveLocalHostRoleUpdate } from "./local-host-role";

describe("local host roles", () => {
  it("requires a role name only for the local host", () => {
    expect(
      needsLocalHostRoleSetup({
        selectedServerId: "srv_local",
        localServerId: "srv_local",
        host: { clientName: undefined },
      }),
    ).toBe(true);
    expect(
      needsLocalHostRoleSetup({
        selectedServerId: "srv_local",
        localServerId: "srv_local",
        host: { clientName: "书记" },
      }),
    ).toBe(false);
    expect(
      needsLocalHostRoleSetup({
        selectedServerId: "srv_remote",
        localServerId: "srv_local",
        host: { clientName: undefined },
      }),
    ).toBe(false);
  });

  it("defaults the local role type to admin when assigning its first role name", () => {
    expect(resolveLocalHostRoleUpdate({ role: undefined }, "  书记  ")).toEqual({
      clientName: "书记",
      role: "admin",
    });
  });

  it("preserves an explicitly assigned member role", () => {
    expect(resolveLocalHostRoleUpdate({ role: "member" }, "书记")).toEqual({
      clientName: "书记",
      role: "member",
    });
  });

  it("rejects an empty or overlong role name", () => {
    expect(resolveLocalHostRoleUpdate({ role: "admin" }, "   ")).toBeNull();
    expect(resolveLocalHostRoleUpdate({ role: "admin" }, "x".repeat(121))).toBeNull();
  });
});
