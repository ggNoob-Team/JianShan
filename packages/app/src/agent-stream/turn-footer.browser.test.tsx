import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { TurnTiming } from "@/timeline/turn-time";
import type { StreamItem } from "@/types/stream";
import { createNativeStreamStrategy } from "./strategy-native";
import { CompletedTurnFooterRow } from "./turn-footer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// A Sunday, so a turn that ended on Friday shows a weekday timestamp.
const NOW = new Date(2026, 10, 8, 5, 0);
const FRIDAY_NIGHT = new Date(2026, 10, 6, 23, 11);

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  host = document.createElement("div");
  host.style.width = "880px";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

const reply: StreamItem = {
  kind: "assistant_message",
  id: "reply",
  text: "Done.",
  timestamp: FRIDAY_NIGHT,
};

function renderCompletedFooter(timing: TurnTiming): void {
  act(() =>
    root.render(
      <CompletedTurnFooterRow
        strategy={createNativeStreamStrategy()}
        items={[reply]}
        timing={timing}
        startIndex={0}
        supportsTimelineCursor={false}
      />,
    ),
  );
}

/** How many painted lines each footer label takes. */
function paintedLinesByLabel(element: HTMLElement): Record<string, number> {
  const lines: Record<string, number> = {};
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent ?? "";
    if (!text.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    lines[text] = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
  }
  return lines;
}

// JianShan keeps the completion timestamp as the single footer timing label. Duration belongs
// to the turn activity header, so the footer must not render both values.
it.each(["en", "ja"] as const)(
  "renders one completion timestamp line when the chat has room (%s)",
  async (language) => {
    await i18n.changeLanguage(language);
    renderCompletedFooter({ completedAt: FRIDAY_NIGHT, durationMs: 26_000 });

    const labels = paintedLinesByLabel(host);
    const completionLabel = Object.keys(labels).find((label) => label.includes("23:11"));
    expect(completionLabel).toBeDefined();
    expect(labels[completionLabel!]).toBe(1);
  },
);
