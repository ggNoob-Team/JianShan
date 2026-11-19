import { describe, expect, it } from "vitest";
import { teamAccentColor, teamAccentForeground, teamChartPalette } from "./team-accent";

describe("teamAccentColor", () => {
  it("uses the myAgents primary and categorical palette for light and dark themes", () => {
    expect(teamAccentColor({ colorScheme: "light" })).toBe("#3459a6");
    expect(teamAccentColor({ colorScheme: "dark" })).toBe("#7aa7ff");
    expect(teamAccentForeground({ colorScheme: "light" })).toBe("#ffffff");
    expect(teamAccentForeground({ colorScheme: "dark" })).toBe("#0d1421");
    expect(teamChartPalette({ colorScheme: "light" }).slice(0, 3)).toEqual([
      "#3459a6",
      "#5f82ca",
      "#1d8451",
    ]);
  });
});
