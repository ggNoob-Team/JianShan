import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";

test("team page uses the myAgents blue accent", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await gotoAppShell(page);
  await page.goto(`/h/${getServerId()}/team`);

  await expect(page.getByTestId("team-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("见山治理 / 团队管理", { exact: true })).toHaveCSS(
    "color",
    "rgb(52, 89, 166)",
  );
});

test("mobile team member controls wrap instead of becoming one long row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAppShell(page);
  await page.goto(`/h/${getServerId()}/team`);

  await expect(page.getByTestId("team-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("team-member-tabs")).toHaveCSS("flex-wrap", "wrap");
});

test("the admin sidebar team entry opens connected team data", async ({ page, withWorkspace }) => {
  const workspace = await withWorkspace({ prefix: "team-sidebar-" });
  await workspace.navigateTo();
  await page.evaluate(() => {
    const registryKey = "@paseo:daemon-registry";
    const nonceKey = "@paseo:e2e-seed-nonce";
    const disableSeedOnceKey = "@paseo:e2e-disable-default-seed-once";
    const nonce = localStorage.getItem(nonceKey);
    const rawRegistry = localStorage.getItem(registryKey);
    if (!nonce || !rawRegistry) throw new Error("Expected the E2E host seed before reloading");
    const registry = JSON.parse(rawRegistry) as Array<{ role?: string }>;
    if (!registry[0]) throw new Error("Expected a seeded host");
    registry[0].role = "admin";
    localStorage.setItem(registryKey, JSON.stringify(registry));
    localStorage.setItem(disableSeedOnceKey, nonce);
  });
  await page.reload();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("@paseo:daemon-registry");
        return raw ? (JSON.parse(raw) as Array<{ role?: string }>)[0]?.role : undefined;
      }),
    )
    .toBe("admin");
  await page.getByTestId("sidebar-team").click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByTestId("team-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("team-member-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("没有已连接的 Host")).toHaveCount(0);
});
