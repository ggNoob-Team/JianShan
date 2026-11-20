import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

const CAPTURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.use({ viewport: { width: 390, height: 960 }, isMobile: true, hasTouch: true });

test("captures a screenshot, edits it, and returns it to Quick Input", async ({
  page,
}, testInfo) => {
  await page.addInitScript((dataUrl) => {
    (window as unknown as Record<string, unknown>).paseoScreenCapture = {
      capturePage(callback: (resultJson: string) => void) {
        callback(JSON.stringify({ ok: true, dataUrl }));
      },
    };
  }, CAPTURE_DATA_URL);

  const agent = await seedMockAgentWorkspace({
    repoPrefix: "screenshot-mvp-",
    title: "Screenshot MVP",
    initialPrompt: "Screenshot target",
  });
  try {
    await openAgentRoute(page, agent);
    const screenshotButton = page.getByTestId("workspace-header-screenshot-button");
    const notesButton = page.getByTestId("workspace-notes-button");
    await expect(screenshotButton).toBeVisible();
    await expect(notesButton).toBeVisible();
    const [screenshotBounds, notesBounds] = await Promise.all([
      screenshotButton.boundingBox(),
      notesButton.boundingBox(),
    ]);
    if (!screenshotBounds || !notesBounds)
      throw new Error("Workspace header buttons have no bounds");
    expect(
      Math.abs(
        screenshotBounds.y + screenshotBounds.height / 2 - (notesBounds.y + notesBounds.height / 2),
      ),
    ).toBeLessThan(12);
    const screenshotLeft = Math.min(screenshotBounds.x, notesBounds.x);
    const screenshotRight = Math.max(
      screenshotBounds.x + screenshotBounds.width,
      notesBounds.x + notesBounds.width,
    );
    expect(screenshotRight - screenshotLeft).toBeLessThan(96);

    const headerScreenshotPath = testInfo.outputPath("workspace-header.png");
    await page.screenshot({ path: headerScreenshotPath });
    await testInfo.attach("workspace-header", {
      path: headerScreenshotPath,
      contentType: "image/png",
    });

    await screenshotButton.click();
    await expect(page.getByTestId("screenshot-editor")).toBeVisible();
    await page.getByTestId("screenshot-tool-crop").click();
    await expect(page.getByTestId("screenshot-editor-apply-crop")).toBeVisible();
    await page.getByTestId("screenshot-editor-apply-crop").click();
    await expect(page.getByTestId("screenshot-canvas")).toBeVisible();
    await expect(page.getByTestId("screenshot-tool-pen")).toBeVisible();
    const canvas = page.getByTestId("screenshot-canvas");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Screenshot canvas has no bounds");
    await page.mouse.move(bounds.x + 20, bounds.y + 20);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 100, bounds.y + 80);
    await page.mouse.up();
    await expect(page.getByTestId("screenshot-tool-undo")).toBeEnabled();

    const countRedPixels = () =>
      canvas.evaluate((element) => {
        const drawingCanvas = element as HTMLCanvasElement;
        const data = drawingCanvas
          .getContext("2d")
          ?.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height).data;
        if (!data) return 0;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] > 200 && data[index + 1] < 120 && data[index + 2] < 120) count += 1;
        }
        return count;
      });
    const redPixelsBeforeText = await countRedPixels();

    await page.getByTestId("screenshot-tool-text").tap();
    await canvas.tap({ position: { x: bounds.width - 8, y: bounds.height - 8 } });
    const textInput = page.getByTestId("screenshot-text-input");
    await expect(textInput).toBeVisible();
    await textInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(input, value);
    }, "审核备注");
    await page.getByTestId("screenshot-text-add").tap();
    await expect(textInput).toBeHidden();
    await expect(page.getByTestId("screenshot-tool-undo")).toBeEnabled();
    await expect.poll(countRedPixels).toBeGreaterThan(redPixelsBeforeText);

    const screenshotPath = testInfo.outputPath("screenshot-editor.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("screenshot-editor", {
      path: screenshotPath,
      contentType: "image/png",
    });
    await page.getByTestId("screenshot-editor-send").click();
    await expect(page.getByTestId("quick-input-screen")).toBeVisible();
    await expect(page.getByTestId("quick-input-attachment-tray")).toBeVisible();
    await expect(page.getByTestId("quick-input-image-attachment-pill")).toBeVisible();
  } finally {
    await agent.cleanup();
  }
});
