import { describe, expect, it } from "vitest";
import { newSessionClientName, resumedClientName } from "./websocket-client-name";

describe("newSessionClientName", () => {
  it("defaults mobile sessions without a name", () => {
    expect(newSessionClientName("mobile", undefined)).toBe("JianShan");
    expect(newSessionClientName("mobile", "   ")).toBe("JianShan");
  });

  it("keeps an explicit mobile name", () => {
    expect(newSessionClientName("mobile", " 少爷 ")).toBe("少爷");
  });

  it("leaves non-mobile clients unnamed", () => {
    expect(newSessionClientName("cli", undefined)).toBeUndefined();
    expect(newSessionClientName("browser", undefined)).toBeUndefined();
  });
});

describe("resumedClientName", () => {
  it("returns undefined when the hello has no name", () => {
    expect(resumedClientName(undefined)).toBeUndefined();
    expect(resumedClientName("   ")).toBeUndefined();
  });

  it("normalizes a provided name", () => {
    expect(resumedClientName(" 少爷 ")).toBe("少爷");
  });
});
