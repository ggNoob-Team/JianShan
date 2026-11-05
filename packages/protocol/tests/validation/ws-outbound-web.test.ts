import { describe, expect, it } from "vitest";
import { validateWSOutboundMessage } from "../../src/validation/ws-outbound-web.js";

describe("browser WS outbound validation", () => {
  it("accepts a minimal valid message and rejects a corrupted message", () => {
    expect(validateWSOutboundMessage({ type: "pong" }).success).toBe(true);
    expect(validateWSOutboundMessage({ type: "not_a_message" }).success).toBe(false);
  });
});
