import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";

test("team page uses the admin console blue accent", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await gotoAppShell(page);
  await page.goto(`/h/${getServerId()}/team`);

  await expect(page.getByTestId("team-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("见山治理 / 团队管理", { exact: true })).toHaveCSS(
    "color",
    "rgb(30, 64, 175)",
  );
});
