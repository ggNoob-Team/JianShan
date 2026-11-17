import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { installDaemonWebSocketGate } from "../support/helpers/daemon-websocket-gate";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 390, height: 844 },
] as const;

async function captureDialog(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectDialogSettled(page: Page, compact: boolean): Promise<void> {
  const dialog = page.getByTestId("project-notes-dialog");
  await expect
    .poll(async () => {
      const [box, viewport] = [await dialog.boundingBox(), page.viewportSize()];
      if (!box || !viewport) return false;
      if (compact) {
        const snapTop = Math.round(viewport.height * (1 - 0.88));
        return box.y >= snapTop && box.y <= snapTop + 32;
      }
      return box.y >= 0 && box.y + box.height <= viewport.height;
    })
    .toBe(true);
}

for (const viewport of VIEWPORTS) {
  test(`workspace notes open in a ${viewport.name} dialog and refresh the visible project notes`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const workspace = await seedWorkspace({ repoPrefix: "project-notes-dialog-" });
    try {
      const note = await workspace.client.createNote({
        projectId: workspace.projectId,
        title: "Initial note title",
        text: "Initial note body",
      });
      const agent = await workspace.client.createAgent({
        provider: "mock",
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "Notes dialog check",
        modeId: "load-test",
        model: "e2e-fast-stream",
      });

      const gate = await installDaemonWebSocketGate(page);
      await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: agent.id });
      await expect.poll(() => gate.getClientRequestCount("notes.list.request")).toBeGreaterThan(0);
      const requestsBeforeOpen = gate.getClientRequestCount("notes.list.request");
      const workspaceUrl = page.url();
      await page.getByTestId("workspace-notes-button").click();

      await expect(page.getByTestId("project-notes-dialog")).toBeVisible({ timeout: 10_000 });
      await expectDialogSettled(page, viewport.name === "compact");
      await expect(page).toHaveURL(workspaceUrl);
      expect(gate.getClientRequestCount("notes.list.request")).toBe(requestsBeforeOpen);
      await expect(page.getByTestId(`note-row-${note.noteId}`)).toContainText("Initial note title");
      await captureDialog(page, testInfo, `project-notes-${viewport.name}-before-refresh`);

      await workspace.client.updateNote({
        noteId: note.noteId,
        projectId: workspace.projectId,
        title: "Refreshed note title",
        text: "Refreshed note body",
      });
      await page.getByTestId("project-notes-refresh").click();
      await expect
        .poll(() => gate.getClientRequestCount("notes.list.request"))
        .toBeGreaterThan(requestsBeforeOpen);

      await expect(page.getByTestId(`note-row-${note.noteId}`)).toContainText(
        "Refreshed note title",
        { timeout: 10_000 },
      );
      await expect(page.getByText("Refreshed note body", { exact: true })).toBeVisible();
      await captureDialog(page, testInfo, `project-notes-${viewport.name}-after-refresh`);

      await page.getByTestId(`note-details-${note.noteId}`).click();
      const detail = page.getByTestId("project-notes-detail");
      await expect(detail).toBeVisible();
      await expect(detail.getByText("Refreshed note title", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(workspaceUrl);
      await expectDialogSettled(page, viewport.name === "compact");
      await captureDialog(page, testInfo, `project-notes-${viewport.name}-detail`);

      await page.getByTestId("note-edit").click();
      await page.getByTestId("note-title-input").fill("Dialog edited title");
      await page.getByTestId("note-save").first().click();
      await expect(detail.getByText("Dialog edited title", { exact: true })).toBeVisible();

      await page.getByTestId("sheet-header-back").click();
      await expect(page.getByTestId("project-notes-list")).toBeVisible();
      await expect(page.getByTestId(`note-row-${note.noteId}`)).toContainText(
        "Dialog edited title",
      );
      await expect(page).toHaveURL(workspaceUrl);
    } finally {
      await workspace.cleanup();
    }
  });
}

test("a compact empty project shows the notes empty state and add action", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const workspace = await seedWorkspace({ repoPrefix: "project-notes-empty-" });
  try {
    const agent = await workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "Empty notes dialog check",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });

    const gate = await installDaemonWebSocketGate(page);
    await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: agent.id });
    await expect.poll(() => gate.getClientRequestCount("notes.list.request")).toBeGreaterThan(0);
    const requestsBeforeOpen = gate.getClientRequestCount("notes.list.request");
    await page.getByTestId("workspace-notes-button").click();

    await expect(page.getByTestId("project-notes-dialog")).toBeVisible({ timeout: 10_000 });
    expect(gate.getClientRequestCount("notes.list.request")).toBe(requestsBeforeOpen);
    await expectDialogSettled(page, true);
    await expect(page.getByTestId("project-notes-empty")).toBeVisible();
    await expect(page.getByTestId("notes-add-note")).toBeVisible();
    await captureDialog(page, testInfo, "project-notes-compact-empty");

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText("Captured note body"));
    await page.getByTestId("notes-add-note").click();
    await expect(page.getByTestId("add-note-text")).toHaveValue("Captured note body");
  } finally {
    await workspace.cleanup();
  }
});
