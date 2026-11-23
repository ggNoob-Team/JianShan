import { z } from "zod";

export const MAX_CLIENT_NAME_LENGTH = 120;

/** Display role for work created programmatically by an agent rather than a person. */
export const VIRTUAL_ACTOR_ROLE_NAME = "筑梦";

/** Workspace branch/name prefix reserved for the virtual 筑梦 role. */
export const DREAM_WORKSPACE_PREFIX = "dream/";

export function isDreamWorkspaceName(value: string | null | undefined): boolean {
  return value?.trim().startsWith(DREAM_WORKSPACE_PREFIX) === true;
}

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
  /** The role was inherited by an agent-created session rather than chosen by a user. */
  virtual: z.boolean().optional(),
});

export type AgentActor = z.infer<typeof AgentActorSchema>;

export function normalizeClientName(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
