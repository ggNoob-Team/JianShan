import { normalizeClientName } from "@getpaseo/protocol/agent-actor";
import type { WSHelloMessage } from "@getpaseo/protocol/messages";

export function newSessionClientName(
  _clientType: WSHelloMessage["clientType"],
  clientName: string | undefined,
): string | undefined {
  return normalizeClientName(clientName);
}

export function resumedClientName(clientName: string | undefined): string | undefined {
  return normalizeClientName(clientName);
}
