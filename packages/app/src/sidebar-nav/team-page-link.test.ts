import { describe, expect, it } from "vitest";

import { buildTeamPageUrl } from "./team-page-link";

describe("buildTeamPageUrl", () => {
  it("opens the team route on the admin console", () => {
    expect(buildTeamPageUrl("http://127.0.0.1:6769/")).toBe("http://127.0.0.1:6769/team");
  });

  it("preserves an admin console subpath", () => {
    expect(buildTeamPageUrl("https://admin.example.test/paseo/")).toBe(
      "https://admin.example.test/paseo/team",
    );
  });

  it("rejects missing and non-http admin URLs", () => {
    expect(buildTeamPageUrl(null)).toBeNull();
    expect(buildTeamPageUrl("file:///tmp/admin")).toBeNull();
  });
});
