import path from "node:path";
import { expect, test } from "../support/fixtures";
import type { SeedDaemonClient } from "../support/helpers/seed-client";
import { ensureExplorerSidebar } from "../support/helpers/workspace-tabs";

interface ArchifyTraceSeedClient extends SeedDaemonClient {
  openArchifyWorkspace(workspaceId: string): Promise<{ autoGenerate: boolean }>;
  getArchifyGeneration(workspaceId: string): Promise<{ status: string } | null>;
}

test("opens an Archify generator in a normal agent tab", async ({
  e2eWorkerClient,
  page,
  withWorkspace,
}) => {
  test.setTimeout(180_000);
  const workspace = await withWorkspace({ prefix: "archify-agent-trace-" });
  const archifyClient = e2eWorkerClient as ArchifyTraceSeedClient;

  // Consume the one-shot auto-generation signal so the panel is fully mounted
  // and subscribed before this test starts a worker.
  await archifyClient.openArchifyWorkspace(workspace.workspaceId);
  await workspace.navigateTo();
  await ensureExplorerSidebar(page);

  const openArchify = page
    .getByRole("button", { name: "Open Archify" })
    .filter({ visible: true })
    .first();
  await expect(openArchify).toBeVisible({ timeout: 30_000 });
  await openArchify.click();
  await expect(page.getByTestId("workspace-tab-archify")).toBeVisible();
  await expect(page.getByPlaceholder("Search calls, variables, flows, or steps")).toBeVisible();

  await page
    .getByRole("button", { name: "Generate", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByText("Confirm what the diagrams must cover")).toBeVisible();
  await expect(
    page.getByText(path.basename(workspace.repoPath), { exact: true }).first(),
  ).toBeVisible({ timeout: 45_000 });
  await page
    .getByRole("button", { name: "Whole workspace", exact: true })
    .filter({ visible: true })
    .first()
    .click();

  const traceButton = page
    .getByTestId(/^archify-agent-trace-/)
    .filter({ visible: true })
    .first();
  await expect(traceButton).toBeVisible({ timeout: 60_000 });
  await traceButton.click();

  const agentTab = page
    .locator('[data-testid^="workspace-tab-agent_"]')
    .filter({ visible: true })
    .first();
  await expect(agentTab).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("I'll take a look at the scroll anchor behavior you described.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(
      async () => (await archifyClient.getArchifyGeneration(workspace.workspaceId))?.status ?? null,
      { timeout: 60_000 },
    )
    .not.toBe("running");
  await expect(agentTab).toBeVisible();
});
