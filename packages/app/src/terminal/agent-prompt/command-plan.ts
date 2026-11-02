import { truncateTerminalText } from "./terminal-output";

const MAX_OBSERVATION_OUTPUT_CHARS = 12_000;

export type OperatorAgentDecision =
  | {
      type: "commands";
      commands: string[];
      note: string | null;
    }
  | {
      type: "finish";
      conclusion: string;
    };

const REPLY_SCHEMA = [
  '{"action":"run","commands":["one shell command per string"],"note":"optional short reason"}',
  '{"action":"finish","conclusion":"final answer to the user"}',
].join("\n");

export interface OperatorStartPromptInput {
  request: string;
  cwd: string;
}

/**
 * The visible terminal is the only execution surface. The operator agent only
 * reasons about the next command and receives PTY output back in a later turn.
 */
export function buildOperatorStartPrompt({ request, cwd }: OperatorStartPromptInput): string {
  return [
    "You are operating a terminal that is already open on the user's machine.",
    `The terminal cwd is ${cwd}.`,
    "Work in short rounds: request commands, inspect their captured output, then decide what to do next.",
    "The app, not you, executes commands in the visible PTY. Never claim you executed them yourself.",
    "Use non-interactive commands when possible. Keep each command on one line.",
    "Commands that may modify files, permissions, processes, or the network will require user approval.",
    "The app will refuse destructive commands and hand sudo password prompts back to the user.",
    "",
    "Reply with exactly one JSON object and no markdown:",
    REPLY_SCHEMA,
    "",
    'Choose "finish" when no more terminal work is needed. Write the conclusion in the same language as the user request.',
    "",
    "User request:",
    request,
  ].join("\n");
}

export type OperatorObservation =
  | {
      type: "executed";
      round: number;
      commands: string[];
      output: string;
    }
  | {
      type: "blocked";
      round: number;
      commands: string[];
      reasons: string[];
    }
  | {
      type: "rejected";
      round: number;
      commands: string[];
      reason: string | null;
    };

export interface OperatorObservationPromptInput {
  cwd: string;
  observation: OperatorObservation;
}

export function buildOperatorObservationPrompt({
  cwd,
  observation,
}: OperatorObservationPromptInput): string {
  const lines = [`Terminal cwd: ${cwd}`, `Round ${observation.round} result:`];
  if (observation.type === "executed") {
    lines.push(
      "Commands:",
      ...observation.commands.map((command) => `$ ${command}`),
      "",
      "Captured output:",
      truncateTerminalText(observation.output.trim(), MAX_OBSERVATION_OUTPUT_CHARS) ||
        "(no output captured)",
      "",
      "Decide the next step from this real output. Run another command only if needed; otherwise return the final conclusion.",
    );
  } else if (observation.type === "blocked") {
    lines.push(
      "These commands were not executed because the safety gate refused them:",
      ...observation.commands.map((command) => `$ ${command}`),
      "",
      "Reasons:",
      ...observation.reasons.map((reason) => `- ${reason}`),
      "",
      "Choose a safe alternative, or finish by explaining why the request cannot be completed safely. Never retry a refused command.",
    );
  } else {
    lines.push(
      "The user rejected these commands, so they were not executed:",
      ...observation.commands.map((command) => `$ ${command}`),
      ...(observation.reason ? ["", `User reason: ${observation.reason}`] : []),
      "",
      "Do not run those commands again. Choose a different approach or finish with a short explanation.",
    );
  }
  lines.push("", "Reply with exactly one JSON object using the same schema as before.");
  return lines.join("\n");
}

export interface OperatorLimitPromptInput {
  cwd: string;
}

export function buildOperatorLimitPrompt({ cwd }: OperatorLimitPromptInput): string {
  return [
    `The terminal at ${cwd} has reached the maximum number of command rounds.`,
    "Do not request or describe more commands.",
    'Reply with exactly {"action":"finish","conclusion":"..."} and summarize what was learned or why the task is incomplete.',
  ].join("\n");
}

function stripCommandPrefix(line: string): string {
  let next = line.trim();
  if (next.startsWith("$ ")) {
    next = next.slice(2).trim();
  } else if (next.startsWith("> ")) {
    next = next.slice(2).trim();
  }
  if (next.startsWith("`") && next.endsWith("`") && next.length > 1) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

function normalizeCommands(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map(stripCommandPrefix)
      .filter((command) => command.length > 0);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((command): command is string => typeof command === "string")
    .map(stripCommandPrefix)
    .filter((command) => command.length > 0);
}

function extractJson(reply: string): unknown | null {
  const candidates: string[] = [];
  const trimmed = reply.trim();
  if (!trimmed) return null;
  candidates.push(trimmed);
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function parseLegacyDecision(reply: string): OperatorAgentDecision | null {
  const body = reply.trim();
  if (!body) return null;
  if (/^NO_COMMAND$/i.test(body)) {
    return { type: "finish", conclusion: "" };
  }
  const fenced = body.match(/```(?:bash|sh|shell|zsh|console)?\s*([\s\S]*?)```/i);
  if (!fenced?.[1]) return null;
  const commands = normalizeCommands(fenced[1]);
  return commands.length > 0 ? { type: "commands", commands, note: null } : null;
}

/** Parses the operator's JSON decision, with a narrow legacy fallback. */
export function parseOperatorDecision(reply: string): OperatorAgentDecision {
  const parsed = extractJson(reply);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const action = typeof record.action === "string" ? record.action.toLowerCase() : "";
    const conclusion = typeof record.conclusion === "string" ? record.conclusion.trim() : "";
    if (action === "finish" || action === "done" || action === "complete") {
      return { type: "finish", conclusion };
    }
    if (action === "run" || action === "execute" || action === "commands") {
      const commands = normalizeCommands(record.commands);
      if (commands.length > 0) {
        return {
          type: "commands",
          commands,
          note: typeof record.note === "string" ? record.note.trim() || null : null,
        };
      }
    }
  }
  const legacy = parseLegacyDecision(reply);
  if (legacy) return legacy;
  throw new Error("The agent returned an invalid terminal decision");
}

/**
 * Kept for callers and older tests that only need to read command lines from a
 * fenced block. New operator turns use parseOperatorDecision instead.
 */
export function parseCommandPlan(reply: string): string[] {
  const decision = parseOperatorDecision(reply);
  return decision.type === "commands" ? decision.commands : [];
}
