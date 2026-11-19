/* eslint-disable no-empty-pattern -- Playwright reads fixture dependencies from destructured parameters. */
import type { OutdatedDaemon } from "../support/helpers/daemon-update";
import { startOutdatedDaemon } from "../support/helpers/daemon-update";
import { metroTest, expect } from "../support/fixtures";
import { buildCreateAgentPreferences, buildSeededHost } from "../support/helpers/daemon-registry";
import { buildHostTeamRoute } from "../../src/utils/host-routes";

const test = metroTest.extend<{ unsupportedTeamDaemon: OutdatedDaemon }>({
  unsupportedTeamDaemon: async ({}, provide) => {
    const daemon = await startOutdatedDaemon({ teamInsightsCapability: false });
    try {
      await provide(daemon);
    } finally {
      await daemon.close();
    }
  },
});

test("online host without team support explains that the host needs an update", async ({
  page,
  unsupportedTeamDaemon,
}) => {
  const host = buildSeededHost({
    serverId: unsupportedTeamDaemon.serverId,
    endpoint: unsupportedTeamDaemon.endpoint,
    label: "旧 Host",
    role: "admin",
    nowIso: new Date().toISOString(),
  });
  await page.addInitScript(
    ({ seededHost, preferences }) => {
      localStorage.setItem("@paseo:e2e", "1");
      localStorage.setItem("@paseo:daemon-registry", JSON.stringify([seededHost]));
      localStorage.setItem("@paseo:create-agent-preferences", JSON.stringify(preferences));
    },
    { seededHost: host, preferences: buildCreateAgentPreferences() },
  );
  await page.goto(buildHostTeamRoute(unsupportedTeamDaemon.serverId));

  await expect(page.getByText("旧 Host 的 Host 版本过旧，请更新 Host 后重试。")).toBeVisible({
    timeout: 30_000,
  });
});
