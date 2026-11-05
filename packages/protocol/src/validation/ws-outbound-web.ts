import type { z } from "zod";
import { WSOutboundMessageSchema, type WSOutboundMessage } from "../messages.js";

type ValidationResult<T> = { success: true; data: T } | { success: false; error: z.ZodError };

/**
 * Browser builds use the authored schema directly. The generated AOT validator
 * is much faster per message on Hermes, but its 10 MB source costs several
 * seconds to parse on ArkWeb before the app can paint.
 */
export function validateWSOutboundMessage(input: unknown): ValidationResult<WSOutboundMessage> {
  const result = WSOutboundMessageSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}
