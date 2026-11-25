import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectedHosts } from "./index.js";

describe("connected host origin binding", () => {
  const homes: string[] = [];

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("marks the caller's origin host as current without changing the host list", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-current-host-"));
    homes.push(home);
    await writeFile(
      path.join(home, "hosts.json"),
      JSON.stringify([
        {
          registrationId: "hst_mac",
          serverId: "srv_mac",
          connection: "ws://127.0.0.1:6767",
          label: "MacBook",
          metadata: {},
          source: { id: "client-source", key: "srv_mac" },
          enabled: false,
          status: "disabled",
          targetDescription: "127.0.0.1:6767",
          lastOnlineAt: null,
          nextRetryAt: null,
          error: null,
        },
      ]),
    );

    const hosts = new ConnectedHosts(home, { serverId: "srv_remote", label: "Remote" });
    try {
      await expect(
        hosts.listFor({
          sourceId: "client-source",
          manageSources: false,
          originServerId: "srv_mac",
        }),
      ).resolves.toMatchObject({
        self: { serverId: "srv_remote", label: "Remote" },
        hosts: [{ registrationId: "hst_mac", serverId: "srv_mac" }],
        current: {
          serverId: "srv_mac",
          registrationId: "hst_mac",
          label: "MacBook",
        },
      });
    } finally {
      await hosts.close();
    }
  });
});
