import type { AttachmentMetadata } from "@/attachments/types";

let pendingScreenshot: AttachmentMetadata | null = null;

export function setPendingScreenshot(attachment: AttachmentMetadata): void {
  pendingScreenshot = attachment;
}

export function consumePendingScreenshot(): AttachmentMetadata | null {
  const screenshot = pendingScreenshot;
  pendingScreenshot = null;
  return screenshot;
}
