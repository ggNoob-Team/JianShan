import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_ADMIN_KEY,
  ensureAdminKey,
  readAdminKey,
  rotateAdminKey,
  setAdminKey,
} from "./admin-control.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("admin key control", () => {
  test("creates a private key once and can rotate it", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-key-"));
    directories.push(home);
    const first = await ensureAdminKey(home);
    expect(first).toBe(DEFAULT_ADMIN_KEY);
    expect(await ensureAdminKey(home)).toBe(first);
    expect(await readAdminKey(home)).toBe(first);
    if (process.platform !== "win32") {
      expect((await stat(path.join(home, "admin-key"))).mode & 0o777).toBe(0o600);
    }
    const rotated = await rotateAdminKey(home);
    expect(rotated).not.toBe(first);
    expect(await readAdminKey(home)).toBe(rotated);

    await setAdminKey(home, "local-secret");
    expect(await readAdminKey(home)).toBe("local-secret");
  });
});
