import { describe, expect, it } from "vitest";

import {
  buildHumanAgentPrompt,
  buildPromptSenderContextAttachment,
} from "./prompt-sender-context.js";

describe("prompt sender context", () => {
  it("describes the client and origin daemon that sent the message", () => {
    expect(
      buildPromptSenderContextAttachment({
        clientId: "cid-windows",
        clientName: "Windows workstation",
        originServerId: "srv_windows",
      }),
    ).toEqual({
      type: "text",
      mimeType: "text/plain",
      title: "Paseo message sender",
      text: [
        "Paseo message sender context:",
        "Client ID: cid-windows",
        "Client name: Windows workstation",
        "Origin server ID: srv_windows",
      ].join("\n"),
    });
  });

  it("adds sender context to the model prompt without changing the user text", () => {
    expect(
      buildHumanAgentPrompt({
        text: "Copy 123.txt to my desktop.",
        clientId: "cid-windows",
        clientName: "Windows workstation",
        originServerId: "srv_windows",
      }),
    ).toEqual([
      { type: "text", text: "Copy 123.txt to my desktop." },
      {
        type: "text",
        mimeType: "text/plain",
        title: "Paseo message sender",
        text: expect.stringContaining("Origin server ID: srv_windows"),
      },
    ]);
  });

  it("makes a missing origin explicit instead of falling back to the agent creator", () => {
    expect(
      buildPromptSenderContextAttachment({
        clientId: "cid-browser",
        clientName: "Browser",
      })?.text,
    ).toContain("Origin server ID: unavailable");
  });
});
