import { createHostClient } from "@getpaseo/client/node";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

import { readDaemonInstance } from "../daemon-instance.js";
import { readLocalCredentialForTarget } from "../local-credential.js";

export async function withAdminDaemonClient<T>(
  paseoHome: string,
  action: (client: DaemonClient) => Promise<T>,
): Promise<T> {
  const instance = await readDaemonInstance(paseoHome);
  if (!instance?.listen) {
    throw new Error("见山 daemon 未运行或尚未就绪");
  }
  const listen = instance.listen;
  const client = createHostClient(listen, {
    clientId: "paseo-admin-sidecar",
    clientType: "cli",
    localCredential: () => readLocalCredentialForTarget(paseoHome, listen) ?? undefined,
    connectTimeoutMs: 5_000,
    reconnect: { enabled: false },
  });
  try {
    await client.connect();
    return await action(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}
