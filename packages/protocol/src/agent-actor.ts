import { z } from "zod";

export const MAX_CLIENT_NAME_LENGTH = 120;

export const ClientNameSchema = z.string().trim().min(1).max(MAX_CLIENT_NAME_LENGTH);

/** UI role carried by a pairing link. It grants no daemon authority. */
export const PairingRoleSchema = z.enum(["admin", "member"]);
export type PairingRole = z.infer<typeof PairingRoleSchema>;
export const DEFAULT_PAIRING_ROLE: PairingRole = "member";

export function resolvePairingRole(value: PairingRole | null | undefined): PairingRole {
  return value ?? DEFAULT_PAIRING_ROLE;
}

/**
 * Display and audit metadata for the client that originated an action.
 *
 * `clientId` is the stable identity key. `clientName` is user-supplied metadata
 * and must never be treated as an authentication or authorization credential.
 */
export const AgentActorSchema = z.object({
  clientId: z.string().min(1),
  clientName: ClientNameSchema.optional(),
});

export type AgentActor = z.infer<typeof AgentActorSchema>;

export function normalizeClientName(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
