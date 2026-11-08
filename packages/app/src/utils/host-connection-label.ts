import type { HostConnection } from "@/types/host-connection";

/** A compact, credential-free description of a stored host connection. */
export function hostConnectionLabel(connection: HostConnection): string {
  switch (connection.type) {
    case "directTcp":
      return `${connection.endpoint}${connection.useTls ? " · TLS" : ""}`;
    case "relay":
      return `${connection.relayEndpoint}${connection.useTls ? " · TLS" : ""}`;
    case "directSocket":
      return `unix:${connection.path}`;
    case "directPipe":
      return `pipe:${connection.path}`;
    case "remoteSsh":
      return `ssh:${connection.host}${connection.sshPort ? `:${connection.sshPort}` : ""}${
        connection.daemonPort ? ` (daemon :${connection.daemonPort})` : ""
      }`;
    case "routed":
      return `via ${connection.originServerId}`;
  }
}
