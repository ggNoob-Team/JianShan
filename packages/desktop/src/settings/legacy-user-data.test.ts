import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLegacyUserDataPath } from "./legacy-user-data.js";

describe("legacy desktop user data", () => {
  it("keeps using the Paseo profile after the JianShan rename", () => {
    const legacyPath = path.join("/app-data", "Paseo");
    expect(
      resolveLegacyUserDataPath({
        appDataPath: "/app-data",
        currentName: "JianShan",
        legacyName: "Paseo",
        pathExists: (candidate) => candidate === legacyPath,
      }),
    ).toBe(legacyPath);
  });

  it("uses the normal profile for a fresh JianShan install", () => {
    expect(
      resolveLegacyUserDataPath({
        appDataPath: "/app-data",
        currentName: "JianShan",
        legacyName: "Paseo",
        pathExists: () => false,
      }),
    ).toBeNull();
  });

  it("does nothing when the application name did not change", () => {
    expect(
      resolveLegacyUserDataPath({
        appDataPath: "/app-data",
        currentName: "Paseo",
        legacyName: "Paseo",
        pathExists: () => true,
      }),
    ).toBeNull();
  });
});
