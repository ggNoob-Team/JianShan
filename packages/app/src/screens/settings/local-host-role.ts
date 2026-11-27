import {
  MAX_CLIENT_NAME_LENGTH,
  normalizeClientName,
  type PairingRole,
} from "@getpaseo/protocol/agent-actor";
import { resolveHostClientName, type HostProfile } from "@/types/host-connection";

export interface LocalHostRoleUpdate {
  clientName: string;
  role: PairingRole;
}

export function resolveLocalHostRoleUpdate(
  host: Pick<HostProfile, "role">,
  value: string,
): LocalHostRoleUpdate | null {
  const clientName = normalizeClientName(value);
  if (!clientName || clientName.length > MAX_CLIENT_NAME_LENGTH) {
    return null;
  }
  return { clientName, role: host.role ?? "admin" };
}

export function needsLocalHostRoleSetup(input: {
  selectedServerId: string;
  localServerId: string | null;
  host: Pick<HostProfile, "clientName"> | null | undefined;
}): boolean {
  return (
    input.localServerId !== null &&
    input.selectedServerId === input.localServerId &&
    !resolveHostClientName(input.host ?? { clientName: undefined })
  );
}
