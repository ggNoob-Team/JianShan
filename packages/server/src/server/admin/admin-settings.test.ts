import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { hashDaemonPassword } from "../auth.js";
import { readPersistedConfig } from "../persisted-config.js";
import { readAdminConfig, sanitizeAdminConfig, saveAdminConfig } from "./admin-settings.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("admin settings", () => {
  test("hides sensitive values and preserves them when saving", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-admin-settings-"));
    directories.push(home);
    const passwordHash = hashDaemonPassword("daemon-password");
    await writeFile(
      path.join(home, "config.json"),
      JSON.stringify({
        version: 1,
        daemon: {
          listen: "127.0.0.1:6767",
          auth: { password: passwordHash },
        },
        providers: {
          openai: {
            apiKey: "sk-secret",
            baseUrl: "https://example.test",
            stt: { apiKey: "stt-secret" },
          },
        },
        agents: {
          providers: {
            codex: {
              command: ["/usr/local/bin/codex"],
              env: { OPENAI_API_KEY: "env-secret" },
            },
          },
        },
      }),
    );

    const sanitized = sanitizeAdminConfig(readAdminConfig(home));
    expect(JSON.stringify(sanitized)).not.toMatch(
      /password|apiKey|stt-secret|OPENAI_API_KEY|env-secret/,
    );

    const edited = structuredClone(sanitized);
    edited.daemon = { ...edited.daemon, listen: "127.0.0.1:7777" };
    saveAdminConfig(home, edited);

    const persisted = readPersistedConfig(home);
    expect(persisted).toMatchObject({
      daemon: {
        listen: "127.0.0.1:7777",
        auth: { password: passwordHash },
      },
      providers: {
        openai: {
          apiKey: "sk-secret",
          stt: { apiKey: "stt-secret" },
        },
      },
      agents: {
        providers: {
          codex: {
            env: { OPENAI_API_KEY: "env-secret" },
          },
        },
      },
    });
  });
});
