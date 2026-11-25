import type { AgentAttachment } from "@getpaseo/protocol/messages";

import type { AgentPromptInput } from "./agent-sdk-types.js";
import { buildAgentPrompt } from "./prompt-attachments.js";

export interface PromptSenderContext {
  clientId: string;
  clientName?: string | null;
  originServerId?: string | null;
}

export function buildPromptSenderContextAttachment(
  input: PromptSenderContext,
): AgentAttachment | null {
  const clientId = input.clientId.trim();
  if (!clientId) return null;

  const clientName = input.clientName?.trim();
  const originServerId = input.originServerId?.trim();
  return {
    type: "text",
    mimeType: "text/plain",
    title: "Paseo message sender",
    text: [
      "Paseo message sender context:",
      `Client ID: ${clientId}`,
      ...(clientName ? [`Client name: ${clientName}`] : []),
      `Origin server ID: ${originServerId || "unavailable"}`,
    ].join("\n"),
  };
}

export function buildHumanAgentPrompt(
  input: PromptSenderContext & {
    text: string;
    images?: Array<{ data: string; mimeType: string }>;
    attachments?: AgentAttachment[];
  },
): AgentPromptInput {
  const senderContext = buildPromptSenderContextAttachment(input);
  const attachments = senderContext
    ? [...(input.attachments ?? []), senderContext]
    : input.attachments;
  return buildAgentPrompt(input.text, input.images, attachments);
}
