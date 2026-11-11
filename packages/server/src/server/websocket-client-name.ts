import { normalizeClientName } from "@getpaseo/protocol/agent-actor";
import type { WSHelloMessage } from "@getpaseo/protocol/messages";

export const DEFAULT_MOBILE_CLIENT_NAME = "JianShan";

export function newSessionClientName(
  clientType: WSHelloMessage["clientType"],
  clientName: string | undefined,
): string | undefined {
  return (
    normalizeClientName(clientName) ??
    (clientType === "mobile" ? DEFAULT_MOBILE_CLIENT_NAME : undefined)
  );
}

export function resumedClientName(clientName: string | undefined): string | undefined {
  return normalizeClientName(clientName);
}
