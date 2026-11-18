import { describe, expect, it } from "vitest";
import { teamAccentColor, teamAccentForeground } from "./team-accent";

describe("teamAccentColor", () => {
  it("uses the admin console primary for light and dark themes", () => {
    expect(teamAccentColor({ colorScheme: "light" })).toBe("#1e40af");
    expect(teamAccentColor({ colorScheme: "dark" })).toBe("#7aa7ff");
    expect(teamAccentForeground({ colorScheme: "light" })).toBe("#ffffff");
    expect(teamAccentForeground({ colorScheme: "dark" })).toBe("#0d1421");
  });
});
