import { describe, expect, it } from "vitest";
import type { HostConnection } from "@/types/host-connection";
import { hostConnectionLabel } from "./host-connection-label";

describe("hostConnectionLabel", () => {
  it.each([
    [
      { id: "direct:localhost:6767", type: "directTcp", endpoint: "localhost:6767" },
      "localhost:6767",
    ],
    [
      {
        id: "direct:wss:example.com:443",
        type: "directTcp",
        endpoint: "example.com:443",
        useTls: true,
      },
      "example.com:443 · TLS",
    ],
    [
      {
        id: "relay:relay.example.com:443",
        type: "relay",
        relayEndpoint: "relay.example.com:443",
        daemonPublicKeyB64: "public-key",
      },
      "relay.example.com:443",
    ],
    [
      { id: "socket:/tmp/paseo.sock", type: "directSocket", path: "/tmp/paseo.sock" },
      "unix:/tmp/paseo.sock",
    ],
    [
      { id: "pipe:\\\\.\\pipe\\paseo", type: "directPipe", path: "\\\\.\\pipe\\paseo" },
      "pipe:\\\\.\\pipe\\paseo",
    ],
    [
      {
        id: "ssh:deploy@example.com:2222:7777",
        type: "remoteSsh",
        host: "deploy@example.com",
        sshPort: 2222,
        daemonPort: 7777,
      },
      "ssh:deploy@example.com:2222 (daemon :7777)",
    ],
    [{ id: "via:srv_origin", type: "routed", originServerId: "srv_origin" }, "via srv_origin"],
  ] satisfies Array<[HostConnection, string]>)("formats %s", (connection, expected) => {
    expect(hostConnectionLabel(connection)).toBe(expected);
  });
});
